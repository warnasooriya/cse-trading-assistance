import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { CseClient } from "../upstream/cseClient.js";
import type { EventBus } from "./eventBus.js";
import type { createOfflineMarketService } from "../services/offlineMarketService.js";

type Deps = {
  cseClient: CseClient;
  eventBus: EventBus;
  offlineMarketService: ReturnType<typeof createOfflineMarketService>;
};

const periodSchema = z.enum(["1", "2", "3", "4", "5"]).default("1");
const marketWatchQuerySchema = z.object({
  q: z.string().trim().optional(),
  sortBy: z.enum(["symbol", "name", "price", "changePercentage", "sharevolume", "turnover", "marketCap"]).default("turnover"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

const suggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(3).max(50).default(12)
});

const newsQuerySchema = z.object({
  scope: z.enum(["local", "world"]).default("local"),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10)
});

type TradeSummaryRow = {
  id: number | null;
  name: string;
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercentage: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  sharevolume: number | null;
  tradevolume: number | null;
  turnover: number | null;
  marketCap: number | null;
  lastTradedTime: number | null;
  status: number | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeTradeSummaryRows(payload: unknown): TradeSummaryRow[] {
  const rawRows =
    payload &&
    typeof payload === "object" &&
    "reqTradeSummery" in payload &&
    Array.isArray((payload as { reqTradeSummery?: unknown }).reqTradeSummery)
      ? ((payload as { reqTradeSummery: unknown[] }).reqTradeSummery ?? [])
      : [];

  return rawRows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      id: toNumber(row.id),
      name: String(row.name ?? ""),
      symbol: String(row.symbol ?? ""),
      price: toNumber(row.price),
      previousClose: toNumber(row.previousClose),
      change: toNumber(row.change),
      changePercentage: toNumber(row.percentageChange ?? row.changePercentage),
      high: toNumber(row.high),
      low: toNumber(row.low),
      open: toNumber(row.open),
      sharevolume: toNumber(row.sharevolume),
      tradevolume: toNumber(row.tradevolume),
      turnover: toNumber(row.turnover),
      marketCap: toNumber(row.marketCap),
      lastTradedTime: toNumber(row.lastTradedTime),
      status: toNumber(row.status)
    }));
}

function normalizeSharePriceListRows(payload: unknown): TradeSummaryRow[] {
  let rawRows: unknown[] = [];
  if (Array.isArray(payload)) {
    rawRows = payload;
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const nested =
      (Array.isArray(obj.sharePriceList) && (obj.sharePriceList as unknown[])) ||
      (Array.isArray(obj.todaySharePrice) && (obj.todaySharePrice as unknown[])) ||
      (Array.isArray(obj.reqTodaySharePrice) && (obj.reqTodaySharePrice as unknown[])) ||
      null;
    rawRows = nested ?? [payload];
  }

  return rawRows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      id: toNumber(row.id),
      name: String(row.companyName ?? row.name ?? row.symbol ?? ""),
      symbol: String(row.symbol ?? ""),
      price: toNumber(row.lastTradedPrice ?? row.lastTrade ?? row.price),
      previousClose: toNumber(row.previousClose),
      change: toNumber(row.change),
      changePercentage: toNumber(row.changePercentage),
      high: toNumber(row.high),
      low: toNumber(row.low),
      open: toNumber(row.open),
      sharevolume: toNumber(row.crossingVolume ?? row.volume ?? row.shareVolume),
      tradevolume: toNumber(row.crossingTradeVolume ?? row.tradeVolume ?? row.trades),
      turnover: toNumber(row.turnover ?? row.crossingTurnover),
      marketCap: toNumber(row.marketCap),
      lastTradedTime: toNumber(row.lastTradedTime),
      status: toNumber(row.status)
    }));
}

async function mapLimit<TIn, TOut>(items: TIn[], limit: number, fn: (item: TIn) => Promise<TOut>): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

type CompanyInfoSummary = {
  reqSymbolInfo?: {
    symbol?: string;
    name?: string;
    lastTradedPrice?: number | string;
    previousClose?: number | string;
    change?: number | string;
    changePercentage?: number | string;
    hiTrade?: number | string;
    lowTrade?: number | string;
    p12HiPrice?: number | string;
    p12LowPrice?: number | string;
    tdyShareVolume?: number | string;
    marketCap?: number | string;
  };
  reqSymbolBetaInfo?: {
    betaValueSPSL?: number | string;
    triASIBetaValue?: number | string;
  } | null;
};

function buildRecommendation(summary: CompanyInfoSummary) {
  const info = summary.reqSymbolInfo ?? {};
  const betaInfo = summary.reqSymbolBetaInfo ?? {};

  const last = toNumber(info.lastTradedPrice);
  const prevClose = toNumber(info.previousClose);
  const changePct = toNumber(info.changePercentage);
  const hi12 = toNumber(info.p12HiPrice);
  const lo12 = toNumber(info.p12LowPrice);
  const volume = toNumber(info.tdyShareVolume);
  const beta = toNumber(betaInfo.betaValueSPSL) ?? toNumber(betaInfo.triASIBetaValue);

  let score = 0;
  const reasons: string[] = [];

  if (typeof changePct === "number") {
    if (changePct >= 2) {
      score += 1.5;
      reasons.push("Positive daily momentum above 2%");
    } else if (changePct <= -2) {
      score -= 1.5;
      reasons.push("Negative daily momentum below -2%");
    } else {
      reasons.push("Daily momentum is neutral");
    }
  }

  if (typeof last === "number" && typeof hi12 === "number" && typeof lo12 === "number" && hi12 > lo12) {
    const band = hi12 - lo12;
    const position = (last - lo12) / band;
    if (position <= 0.2) {
      score += 1.25;
      reasons.push("Price is near the 12-month low range");
    } else if (position >= 0.8) {
      score -= 1.25;
      reasons.push("Price is near the 12-month high range");
    } else {
      reasons.push("Price is trading mid-range versus the 12-month band");
    }
  }

  if (typeof volume === "number") {
    if (volume > 1_000_000) {
      score += 0.5;
      reasons.push("Healthy intraday volume supports liquidity");
    } else {
      reasons.push("Intraday volume is modest");
    }
  }

  if (typeof beta === "number") {
    if (beta > 1.2) {
      score -= 0.25;
      reasons.push("Higher beta indicates elevated volatility");
    } else if (beta < 0.9) {
      score += 0.25;
      reasons.push("Lower beta indicates relatively controlled volatility");
    }
  }

  if (typeof last === "number" && typeof prevClose === "number" && last > prevClose) {
    score += 0.25;
  }

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  if (score >= 1.5) action = "BUY";
  else if (score <= -1.5) action = "SELL";

  const confidence = Math.max(50, Math.min(92, 50 + Math.abs(score) * 12));

  return {
    action,
    confidence,
    reasons,
    metrics: {
      lastTradedPrice: last,
      previousClose: prevClose,
      changePercentage: changePct,
      high52Week: hi12,
      low52Week: lo12,
      volume,
      beta
    }
  };
}

function decodeHtml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function extractTagValue(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  if (!match) return null;
  const value = match[1] ?? "";
  const cdata = value.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  return decodeHtml((cdata ? cdata[1] : value).trim());
}

async function fetchGoogleNewsRss(scope: "local" | "world", q: string | undefined, limit: number) {
  const defaultQuery =
    scope === "local"
      ? "Colombo Stock Exchange OR Sri Lanka stock market OR CSE Sri Lanka"
      : "global markets OR stock market OR equities";
  const query = q?.trim() ? `${q.trim()} ${defaultQuery}` : defaultQuery;
  const params = new URLSearchParams({
    q: query,
    hl: scope === "local" ? "en" : "en-US",
    gl: scope === "local" ? "LK" : "US",
    ceid: scope === "local" ? "LK:en" : "US:en"
  });
  const url = `https://news.google.com/rss/search?${params.toString()}`;

  const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`News feed failed: HTTP ${res.status} ${text.slice(0, 120)}`);
  }
  const xml = await res.text();
  const items = xml
    .split(/<item>/gi)
    .slice(1)
    .map((chunk) => {
      const lower = chunk.toLowerCase();
      const end = lower.indexOf("</item>");
      return end >= 0 ? chunk.slice(0, end) : chunk;
    });

  const parsed = items
    .map((item) => {
      const title = extractTagValue(item, "title");
      const link = extractTagValue(item, "link");
      const pubDate = extractTagValue(item, "pubDate");
      const source = extractTagValue(item, "source");
      if (!title || !link) return null;
      return { title, link, pubDate, source };
    })
    .filter((x): x is { title: string; link: string; pubDate: string | null; source: string | null } => x !== null)
    .slice(0, limit);

  return parsed;
}

export function createMarketRouter({ cseClient, eventBus, offlineMarketService }: Deps): Router {
  const router = Router();

  router.get("/dashboard", async (req: Request, res: Response) => {
    try {
      const sectorsPeriod = periodSchema.parse(req.query.sectorsPeriod);

      const results = await Promise.allSettled([
        cseClient.getMarketStatus(),
        cseClient.getMarketSummary(),
        cseClient.getAspiSummary(),
        cseClient.getSnpSummary(),
        cseClient.getTopGainers(10),
        cseClient.getTopLosers(10),
        cseClient.getMostActiveTrades(10),
        cseClient.getAllSectors()
      ]);

      const errors: Array<{ source: string; message: string }> = [];

      function pick<T>(index: number, source: string, fallback: T): T {
        const result = results[index];
        if (result.status === "fulfilled") return result.value as T;
        errors.push({ source, message: (result.reason as Error)?.message ?? String(result.reason) });
        return fallback;
      }

      const status = pick(0, "marketStatus", { status: "unknown" });
      const summary = pick(1, "marketSummery", {});
      const aspi = pick(2, "aspiData", {});
      const snp = pick(3, "snpData", {});
      const topGainers = pick<unknown[]>(4, "topGainers", []);
      const topLosers = pick<unknown[]>(5, "topLooses", []);
      const mostActive = pick<unknown[]>(6, "mostActiveTrades", []);
      const sectors = pick<unknown[]>(7, "allSectors", []);

      const sectorItems = await mapLimit(
        (Array.isArray(sectors) ? sectors : []) as Array<{ sectorId?: unknown; symbol?: unknown; indexName?: unknown }>,
        6,
        async (sector) => {
          const sectorId = Number((sector as any).sectorId);
          try {
            const series = await cseClient.getSectorChartData(sectorId, sectorsPeriod);
            const first = series[0]?.v ?? null;
            const last = series.at(-1)?.v ?? null;
            const change = first !== null && last !== null ? last - first : null;
            const changePct = first && last !== null ? (change! / first) * 100 : null;

            return {
              sectorId,
              symbol: String((sector as any).symbol ?? ""),
              indexName: String((sector as any).indexName ?? ""),
              period: sectorsPeriod,
              first,
              last,
              change,
              changePct
            };
          } catch (error) {
            errors.push({
              source: `chartData:${sectorId}`,
              message: (error as Error).message
            });
            return {
              sectorId,
              symbol: String((sector as any).symbol ?? ""),
              indexName: String((sector as any).indexName ?? ""),
              period: sectorsPeriod,
              first: null,
              last: null,
              change: null,
              changePct: null
            };
          }
        }
      );

      const payload = {
        status,
        summary,
        indices: { aspi, snp },
        topGainers,
        topLosers,
        mostActive,
        sectorPerformance: sectorItems,
        errors
      };

      if (errors.length === 0) {
        await eventBus.publish("market.snapshot.updated", {
          at: new Date().toISOString(),
          payload
        });
      }

      res.json(payload);
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/watch", async (req: Request, res: Response) => {
    try {
      const query = marketWatchQuerySchema.parse(req.query);
      const result = await offlineMarketService.getWatchWithFallback(query);

      res.json({
        source: result.source,
        total: result.total,
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
        items: result.items
      });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/suggestions", async (req: Request, res: Response) => {
    try {
      const query = suggestionsQuerySchema.parse(req.query);
      let rows = normalizeTradeSummaryRows(await cseClient.getTradeSummary());
      if (rows.length === 0) {
        try {
          rows = normalizeSharePriceListRows(await cseClient.getTodaySharePriceList());
        } catch {
          rows = [];
        }
      }

      const candidates = rows
        .filter((r) => !!r.symbol && r.symbol.includes("."))
        .sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0))
        .slice(0, Math.min(90, Math.max(30, query.limit * 6)));

      const analyzed = await mapLimit(candidates, 6, async (row) => {
        try {
          const summary = (await cseClient.getCompanyInfoSummary(row.symbol)) as CompanyInfoSummary;
          const reco = buildRecommendation(summary);
          const info = summary.reqSymbolInfo ?? {};

          const last = reco.metrics.lastTradedPrice ?? row.price;
          const changePct = reco.metrics.changePercentage ?? row.changePercentage;
          const volume = reco.metrics.volume ?? row.sharevolume;
          const hi12 = reco.metrics.high52Week;
          const lo12 = reco.metrics.low52Week;
          const marketCap = toNumber(info.marketCap) ?? row.marketCap;

          return {
            symbol: row.symbol,
            name: String(info.name ?? row.name ?? row.symbol),
            action: reco.action,
            confidence: reco.confidence,
            reasons: reco.reasons,
            facts: {
              lastTradedPrice: last,
              changePercentage: changePct,
              volume,
              high52Week: hi12,
              low52Week: lo12,
              turnover: row.turnover,
              marketCap
            }
          };
        } catch (error) {
          return {
            symbol: row.symbol,
            name: row.name ?? row.symbol,
            action: "HOLD" as const,
            confidence: 50,
            reasons: [(error as Error).message],
            facts: {
              lastTradedPrice: row.price,
              changePercentage: row.changePercentage,
              volume: row.sharevolume,
              high52Week: null,
              low52Week: null,
              turnover: row.turnover,
              marketCap: row.marketCap
            }
          };
        }
      });

      const buy = analyzed.filter((x) => x.action === "BUY").sort((a, b) => b.confidence - a.confidence).slice(0, query.limit);
      const sell = analyzed.filter((x) => x.action === "SELL").sort((a, b) => b.confidence - a.confidence).slice(0, query.limit);

      res.json({ scanned: candidates.length, buy, sell });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/news", async (req: Request, res: Response) => {
    try {
      const query = newsQuerySchema.parse(req.query);
      const items = await fetchGoogleNewsRss(query.scope, query.q, query.limit);
      res.json({ scope: query.scope, q: query.q ?? null, items });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  return router;
}
