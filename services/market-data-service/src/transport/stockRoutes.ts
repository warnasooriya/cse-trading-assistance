import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { createOfflineMarketService } from "../services/offlineMarketService.js";
import { computeIndicators, type IndicatorResponse } from "../services/technicalAnalysisClient.js";
import { generateCopilotInsight } from "../services/aiCopilotService.js";

type Deps = { pool: Pool; offlineMarketService: ReturnType<typeof createOfflineMarketService> };

const symbolSchema = z.string().min(1);

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

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

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

const historyQuerySchema = z.object({
  range: z.enum(["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"]).default("1M")
});

const copilotBodySchema = z
  .object({
    range: z.enum(["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"]).default("3M")
  })
  .default({ range: "3M" });

function rangeToDays(range: z.infer<typeof historyQuerySchema>["range"]): number {
  switch (range) {
    case "1D":
      return 1;
    case "1W":
      return 7;
    case "1M":
      return 31;
    case "3M":
      return 93;
    case "6M":
      return 186;
    case "1Y":
      return 365;
    case "5Y":
      return 365 * 5;
  }
}

function mapHistoryToIndicatorCandles(items: Array<{ time: string; close: number | null }>) {
  return items
    .filter((item): item is { time: string; close: number } => typeof item.close === "number" && Number.isFinite(item.close))
    .map((item, index, rows) => {
      const prev = rows[Math.max(0, index - 1)]?.close ?? item.close;
      const base = typeof prev === "number" ? prev : item.close;
      const high = Math.max(base, item.close);
      const low = Math.min(base, item.close);
      return {
        time: item.time,
        open: base,
        high,
        low,
        close: item.close,
        volume: 0
      };
    });
}

async function persistIndicators(pool: Pool, symbol: string, timeframe: string, indicators: IndicatorResponse): Promise<void> {
  const stockRow = await pool.query<{ id: string }>("SELECT id FROM stocks WHERE symbol = $1", [symbol]);
  const stockId = stockRow.rows[0]?.id;
  if (!stockId) return;

  await pool.query(
    `
    INSERT INTO indicators(
      time, stock_id, timeframe, rsi, macd, macd_signal, macd_hist, ema_12, ema_26, sma_20,
      bb_upper, bb_middle, bb_lower, atr_14, vwap, stoch_k, stoch_d
    )
    VALUES (
      now(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16
    )
    ON CONFLICT (stock_id, timeframe, time) DO NOTHING
    `,
    [
      stockId,
      timeframe,
      indicators.rsi_14 ?? null,
      indicators.macd ?? null,
      indicators.macd_signal ?? null,
      indicators.macd_hist ?? null,
      indicators.ema_12 ?? null,
      indicators.ema_26 ?? null,
      indicators.sma_20 ?? null,
      indicators.bb_upper ?? null,
      indicators.bb_middle ?? null,
      indicators.bb_lower ?? null,
      indicators.atr_14 ?? null,
      indicators.vwap ?? null,
      indicators.stoch_k ?? null,
      indicators.stoch_d ?? null
    ]
  );
}

export function createStockRouter({ pool, offlineMarketService }: Deps): Router {
  const router = Router();

  router.get("/:symbol/quote", async (req: Request, res: Response) => {
    try {
      const symbol = symbolSchema.parse(req.params.symbol);
      const result = await offlineMarketService.getQuoteWithFallback(symbol);
      res.json({ ...result.quote, source: result.source });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/:symbol/recommendation", async (req: Request, res: Response) => {
    try {
      const symbol = symbolSchema.parse(req.params.symbol);
      const data = await offlineMarketService.getRecommendationWithFallback(symbol);
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/:symbol/history", async (req: Request, res: Response) => {
    try {
      const symbol = symbolSchema.parse(req.params.symbol);
      const query = historyQuerySchema.parse(req.query);
      const items = await offlineMarketService.getHistoricalSeries(symbol, rangeToDays(query.range));
      res.json({ symbol, range: query.range, items });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/:symbol/indicators", async (req: Request, res: Response) => {
    try {
      const symbol = symbolSchema.parse(req.params.symbol);
      const query = historyQuerySchema.parse(req.query);
      const history = await offlineMarketService.getHistoricalSeries(symbol, rangeToDays(query.range));
      const candles = mapHistoryToIndicatorCandles(history);

      if (candles.length < 20) {
        res.status(400).json({ error: "Not enough historical data to compute indicators" });
        return;
      }

      const indicators = await computeIndicators(candles);
      await persistIndicators(pool, symbol, query.range, indicators);
      res.json({ symbol, range: query.range, indicators });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.post("/:symbol/copilot", async (req: Request, res: Response) => {
    try {
      const symbol = symbolSchema.parse(req.params.symbol);
      const body = copilotBodySchema.parse(req.body ?? {});
      const [quoteResult, recommendationResult, history] = await Promise.all([
        offlineMarketService.getQuoteWithFallback(symbol),
        offlineMarketService.getRecommendationWithFallback(symbol),
        offlineMarketService.getHistoricalSeries(symbol, rangeToDays(body.range))
      ]);

      const candles = mapHistoryToIndicatorCandles(history);
      const indicators =
        candles.length >= 20
          ? await computeIndicators(candles)
          : ({
              explanations: {}
            } as IndicatorResponse);

      if (candles.length >= 20) {
        await persistIndicators(pool, symbol, body.range, indicators);
      }

      const info = quoteResult.quote.reqSymbolInfo ?? {};
      const lastPrice = toNumber(info.lastTradedPrice);
      const changePct = toNumber(info.changePercentage);
      const insight = await generateCopilotInsight({
        symbol,
        companyName: typeof info.name === "string" ? info.name : null,
        action: recommendationResult.action,
        confidence: recommendationResult.confidence,
        lastPrice,
        changePct,
        indicators,
        recentCloses: history.map((item) => item.close).filter((value): value is number => typeof value === "number")
      });

      res.json({
        symbol,
        range: body.range,
        indicators,
        recommendation: recommendationResult,
        copilot: insight
      });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  return router;
}
