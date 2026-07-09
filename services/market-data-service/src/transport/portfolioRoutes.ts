import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { CseClient } from "../upstream/cseClient.js";
import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";
import { generatePortfolioCopilot } from "../services/portfolioCopilotService.js";
import { writeAuditLog } from "../services/auditService.js";

type Deps = {
  pool: Pool;
  fallbackUserId: string;
  portfolioName: string;
  cseClient: CseClient;
};

const DEFAULT_SALES_COMMISSION_RATE = 1.12;

type HoldingRow = {
  symbol: string;
  name: string | null;
  sector_name: string | null;
  quantity: string;
  average_cost: string;
  buy_commission: string;
  sell_commission_rate: string;
  last_price: string | null;
};

type MarketPriceMap = Record<string, number | null>;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeTradeSummaryPriceMap(payload: unknown): MarketPriceMap {
  const rawRows =
    payload &&
    typeof payload === "object" &&
    "reqTradeSummery" in payload &&
    Array.isArray((payload as { reqTradeSummery?: unknown }).reqTradeSummery)
      ? ((payload as { reqTradeSummery: unknown[] }).reqTradeSummery ?? [])
      : [];

  const map: MarketPriceMap = {};
  for (const row of rawRows) {
    if (!row || typeof row !== "object") continue;
    const symbol = String((row as any).symbol ?? "");
    if (!symbol) continue;
    map[symbol] = toNumber((row as any).price);
  }
  return map;
}

function normalizeTodaySharePriceMap(payload: unknown): MarketPriceMap {
  const rawRows = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
  const map: MarketPriceMap = {};
  for (const row of rawRows) {
    if (!row || typeof row !== "object") continue;
    const symbol = String((row as any).symbol ?? "");
    if (!symbol) continue;
    map[symbol] = toNumber((row as any).lastTradedPrice ?? (row as any).lastTrade ?? (row as any).price);
  }
  return map;
}

async function ensureUserPortfolio(pool: Pool, userId: string, name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO portfolios(user_id, name)
    VALUES ($1, $2)
    ON CONFLICT (user_id, name) DO UPDATE SET updated_at = now()
    RETURNING id
    `,
    [userId, name]
  );
  return result.rows[0]!.id;
}

async function ensureStock(pool: Pool, symbol: string, name: string | null): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO stocks(symbol, name)
    VALUES ($1, $2)
    ON CONFLICT (symbol) DO UPDATE SET name = COALESCE(EXCLUDED.name, stocks.name), updated_at = now()
    RETURNING id
    `,
    [symbol, name]
  );
  return result.rows[0]!.id;
}

const upsertHoldingBodySchema = z.object({
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  sector: z.string().trim().min(1).optional(),
  quantity: z.coerce.number().finite().min(0),
  avgCost: z.coerce.number().finite().min(0),
  buyCommission: z.coerce.number().finite().min(0).default(0),
  sellCommissionRate: z.coerce.number().finite().min(0).max(100).default(DEFAULT_SALES_COMMISSION_RATE)
});

function resolveUserId(req: Request, fallbackUserId: string): string {
  const user = getAuthUserFromRequest(req, env.JWT_SECRET);
  return user?.id ?? fallbackUserId;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstFiniteNumber(values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractSectorInfo(payload: unknown): { sectorName: string | null; sectorId: number | null } {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const info =
    root.reqSymbolInfo && typeof root.reqSymbolInfo === "object"
      ? (root.reqSymbolInfo as Record<string, unknown>)
      : {};

  return {
    sectorName: firstNonEmptyString([
      info.sector,
      info.sectorName,
      info.sectorDescription,
      info.sectorDesc,
      info.industry,
      root.sector,
      root.sectorName,
      root.sectorDescription,
      root.sectorDesc,
      root.industry
    ]),
    sectorId: firstFiniteNumber([
      info.sectorId,
      info.sector_id,
      info.sectorCode,
      root.sectorId,
      root.sector_id,
      root.sectorCode
    ])
  };
}

async function loadSectorNameMap(cseClient: CseClient): Promise<Map<number, string>> {
  const sectors = await cseClient.getAllSectors();
  const items = Array.isArray(sectors) ? sectors : [];
  const map = new Map<number, string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const sectorId = firstFiniteNumber([(item as any).sectorId, (item as any).id, (item as any).sector_id]);
    const sectorName = firstNonEmptyString([(item as any).indexName, (item as any).name, (item as any).symbol]);
    if (sectorId !== null && sectorName) {
      map.set(sectorId, sectorName);
    }
  }
  return map;
}

async function hydrateMissingSectorData(pool: Pool, cseClient: CseClient, rows: HoldingRow[]): Promise<Map<string, string>> {
  const missingSymbols = rows
    .filter((row) => !row.sector_name || !row.sector_name.trim())
    .map((row) => row.symbol);
  const sectorBySymbol = new Map<string, string>();

  if (missingSymbols.length === 0) return sectorBySymbol;

  let sectorNameMap: Map<number, string> | null = null;
  for (const symbol of missingSymbols) {
    try {
      const summary = await cseClient.getCompanyInfoSummary(symbol);
      const sectorInfo = extractSectorInfo(summary);
      let sectorName = sectorInfo.sectorName;

      if (!sectorName && sectorInfo.sectorId !== null) {
        if (sectorNameMap === null) {
          try {
            sectorNameMap = await loadSectorNameMap(cseClient);
          } catch {
            sectorNameMap = new Map<number, string>();
          }
        }
        sectorName = sectorNameMap.get(sectorInfo.sectorId) ?? null;
      }

      if (sectorName || sectorInfo.sectorId !== null) {
        await pool.query(
          `
          UPDATE stocks
          SET
            sector_name = COALESCE($2, sector_name),
            sector_id = COALESCE($3, sector_id),
            updated_at = now()
          WHERE symbol = $1
          `,
          [symbol, sectorName, sectorInfo.sectorId]
        );
      }

      if (sectorName) {
        sectorBySymbol.set(symbol, sectorName);
      }
    } catch {
      continue;
    }
  }

  return sectorBySymbol;
}

async function buildPortfolioResponse(params: {
  pool: Pool;
  userId: string;
  portfolioName: string;
  cseClient: CseClient;
}) {
  const portfolioId = await ensureUserPortfolio(params.pool, params.userId, params.portfolioName);
  const holdingsResult = await params.pool.query<HoldingRow>(
    `
    SELECT
      s.symbol,
      s.name,
      s.sector_name,
      s.last_price::text,
      h.quantity::text,
      h.average_cost::text,
      h.buy_commission::text,
      h.sell_commission_rate::text
    FROM holdings h
    JOIN stocks s ON s.id = h.stock_id
    WHERE h.portfolio_id = $1
    ORDER BY s.symbol ASC
    `,
    [portfolioId]
  );

  const hydratedSectorBySymbol = await hydrateMissingSectorData(params.pool, params.cseClient, holdingsResult.rows);

  let priceMap: MarketPriceMap = {};
  try {
    const tradeSummary = await params.cseClient.getTradeSummary();
    priceMap = normalizeTradeSummaryPriceMap(tradeSummary);
  } catch {
    priceMap = {};
  }

  if (Object.keys(priceMap).length === 0) {
    try {
      const today = await params.cseClient.getTodaySharePriceList();
      priceMap = normalizeTodaySharePriceMap(today);
    } catch {
      priceMap = {};
    }
  }

  const baseHoldings = holdingsResult.rows.map((row) => {
    const quantity = Number(row.quantity);
    const avgCost = Number(row.average_cost);
    const buyCommission = Number(row.buy_commission ?? "0");
    const configuredSellCommissionRate = Number(row.sell_commission_rate ?? "0");
    const sellCommissionRate =
      Number.isFinite(configuredSellCommissionRate) && configuredSellCommissionRate > 0
        ? configuredSellCommissionRate
        : DEFAULT_SALES_COMMISSION_RATE;
    const marketPrice = priceMap[row.symbol] ?? toNumber(row.last_price);
    const valuationPrice = marketPrice ?? avgCost;
    const costBasis = quantity * avgCost;
    const totalInvested = costBasis;
    const marketValue = quantity * valuationPrice;
    const estimatedSellCommission = marketValue * (sellCommissionRate / 100);
    const estimatedNetProceeds = marketValue - estimatedSellCommission;
    const grossProfit = marketValue - costBasis;
    const netProfit = estimatedNetProceeds - costBasis;
    const grossReturnPct = costBasis > 0 ? (grossProfit / costBasis) * 100 : 0;
    const netReturnPct = costBasis > 0 ? (netProfit / costBasis) * 100 : 0;
    const breakEvenPrice =
      quantity > 0 && sellCommissionRate < 100 ? costBasis / (quantity * (1 - sellCommissionRate / 100)) : avgCost;

    return {
      symbol: row.symbol,
      name: row.name ?? row.symbol,
      sector: hydratedSectorBySymbol.get(row.symbol) ?? row.sector_name ?? "Unclassified",
      quantity,
      avgCost,
      buyCommission,
      sellCommissionRate,
      marketPrice,
      costBasis,
      totalInvested,
      marketValue,
      estimatedSellCommission,
      estimatedNetProceeds,
      grossProfit,
      netProfit,
      grossReturnPct,
      netReturnPct,
      breakEvenPrice
    };
  });

  const totalMarketValue = baseHoldings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const holdings = baseHoldings.map((holding) => ({
    ...holding,
    weightPct: totalMarketValue > 0 ? (holding.marketValue / totalMarketValue) * 100 : 0
  }));

  const summary = holdings.reduce(
    (acc, holding) => {
      acc.holdingsCount += 1;
      acc.totalQuantity += holding.quantity;
      acc.totalCostBasis += holding.costBasis;
      acc.totalBuyCommission += holding.buyCommission;
      acc.totalInvested += holding.totalInvested;
      acc.totalMarketValue += holding.marketValue;
      acc.totalEstimatedSellCommission += holding.estimatedSellCommission;
      acc.totalEstimatedNetProceeds += holding.estimatedNetProceeds;
      acc.totalGrossProfit += holding.grossProfit;
      acc.totalNetProfit += holding.netProfit;
      return acc;
    },
    {
      holdingsCount: 0,
      totalQuantity: 0,
      totalCostBasis: 0,
      totalBuyCommission: 0,
      totalInvested: 0,
      totalMarketValue: 0,
      totalEstimatedSellCommission: 0,
      totalEstimatedNetProceeds: 0,
      totalGrossProfit: 0,
      totalNetProfit: 0
    }
  );

  return {
    id: portfolioId,
    name: params.portfolioName,
    summary: {
      ...summary,
      grossReturnPct: summary.totalCostBasis > 0 ? (summary.totalGrossProfit / summary.totalCostBasis) * 100 : 0,
      netReturnPct: summary.totalInvested > 0 ? (summary.totalNetProfit / summary.totalInvested) * 100 : 0
    },
    holdings
  };
}

export function createPortfolioRouter({ pool, fallbackUserId, portfolioName, cseClient }: Deps): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req, fallbackUserId);
      res.json(await buildPortfolioResponse({ pool, userId, portfolioName, cseClient }));
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/copilot", async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req, fallbackUserId);
      const portfolio = await buildPortfolioResponse({ pool, userId, portfolioName, cseClient });
      const news = await pool.query(
        `
        SELECT title, sentiment, sentiment_score, symbol, raw
        FROM news_articles
        ORDER BY COALESCE(published_at, created_at) DESC
        LIMIT 12
        `
      );
      const copilot = await generatePortfolioCopilot({
        holdings: portfolio.holdings.map((holding) => ({
          symbol: holding.symbol,
          sector: holding.sector,
          weightPct: holding.weightPct,
          netProfit: holding.netProfit,
          netReturnPct: holding.netReturnPct,
          breakEvenPrice: holding.breakEvenPrice,
          marketPrice: holding.marketPrice
        })),
        totalMarketValue: portfolio.summary.totalMarketValue,
        totalNetProfit: portfolio.summary.totalNetProfit,
        topNews: news.rows.map((row: any) => ({
          title: String(row.title ?? ""),
          sentiment: String(row.sentiment ?? "Neutral"),
          sentimentScore: Number(row.sentiment_score ?? 0),
          symbols: typeof row.symbol === "string" && row.symbol ? [row.symbol] : Array.isArray(row.raw?.symbols) ? row.raw.symbols : []
        }))
      });
      res.json(copilot);
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.post("/holdings", async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req, fallbackUserId);
      const body = upsertHoldingBodySchema.parse(req.body);
      const portfolioId = await ensureUserPortfolio(pool, userId, portfolioName);
      const stockId = await ensureStock(pool, body.symbol, body.name ?? null);

      if (body.name || body.sector) {
        await pool.query(
          `
          UPDATE stocks
          SET
            name = COALESCE($2, name),
            sector_name = COALESCE($3, sector_name),
            updated_at = now()
          WHERE id = $1
          `,
          [stockId, body.name ?? null, body.sector ?? null]
        );
      }

      await pool.query(
        `
        INSERT INTO holdings(portfolio_id, stock_id, quantity, average_cost, buy_commission, sell_commission_rate)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (portfolio_id, stock_id)
        DO UPDATE SET
          quantity = EXCLUDED.quantity,
          average_cost = EXCLUDED.average_cost,
          buy_commission = EXCLUDED.buy_commission,
          sell_commission_rate = EXCLUDED.sell_commission_rate,
          updated_at = now()
        `,
        [portfolioId, stockId, body.quantity, body.avgCost, body.buyCommission, body.sellCommissionRate]
      );
      await writeAuditLog({
        pool,
        userId,
        action: "PORTFOLIO_HOLDING_UPSERTED",
        entityType: "portfolio",
        entityId: portfolioId,
        metadata: { symbol: body.symbol, quantity: body.quantity, avgCost: body.avgCost }
      });

      res.status(201).json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/holdings/:symbol", async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req, fallbackUserId);
      const symbol = z.string().trim().min(1).parse(req.params.symbol);
      const portfolioId = await ensureUserPortfolio(pool, userId, portfolioName);

      const stock = await pool.query<{ id: string }>("SELECT id FROM stocks WHERE symbol = $1", [symbol]);
      const stockId = stock.rows[0]?.id;
      if (!stockId) {
        res.json({ ok: true });
        return;
      }

      await pool.query("DELETE FROM holdings WHERE portfolio_id = $1 AND stock_id = $2", [portfolioId, stockId]);
      await writeAuditLog({
        pool,
        userId,
        action: "PORTFOLIO_HOLDING_DELETED",
        entityType: "portfolio",
        entityId: portfolioId,
        metadata: { symbol }
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
