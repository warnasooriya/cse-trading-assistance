import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { CseClient } from "../upstream/cseClient.js";
import type { createOfflineMarketService } from "../services/offlineMarketService.js";

type Deps = { cseClient: CseClient; offlineMarketService: ReturnType<typeof createOfflineMarketService> };

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

function toNumber(value: number | string | undefined): number | null {
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

export function createStockRouter({ cseClient, offlineMarketService }: Deps): Router {
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

  return router;
}
