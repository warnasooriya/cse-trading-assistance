import type { AppCache } from "../cache/redisCache.js";
import type { Pool } from "pg";
import type { CseClient } from "../upstream/cseClient.js";
import { createMarketRepository, type StoredMarketRow } from "../persistence/marketRepository.js";

export type CompanyInfoSummary = {
  reqSymbolInfo?: {
    symbol?: string;
    name?: string;
    lastTradedPrice?: number | string;
    previousClose?: number | string;
    change?: number | string;
    changePercentage?: number | string;
    hiTrade?: number | string;
    lowTrade?: number | string;
    open?: number | string;
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

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeTradeSummaryRows(payload: unknown): StoredMarketRow[] {
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

export function normalizeSharePriceListRows(payload: unknown): StoredMarketRow[] {
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

export function buildRecommendation(summary: CompanyInfoSummary) {
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

export function createOfflineMarketService(deps: { pool: Pool; cache: AppCache; cseClient: CseClient }) {
  const repository = createMarketRepository(deps.pool);

  async function refreshAndPersistMarketWatch(): Promise<StoredMarketRow[]> {
    let rows = normalizeTradeSummaryRows(await deps.cseClient.getTradeSummary());
    if (rows.length === 0) {
      rows = normalizeSharePriceListRows(await deps.cseClient.getTodaySharePriceList());
    }

    const capturedAt = new Date();
    if (rows.length > 0) {
      await repository.saveMarketRows(rows, capturedAt);
      await deps.cache.setJson("market:watch:latest", rows as never, 60 * 10);
    }
    return rows;
  }

  return {
    refreshAndPersistMarketWatch,
    getWatchWithFallback: async (query: {
      q?: string;
      sortBy: "symbol" | "name" | "price" | "changePercentage" | "sharevolume" | "turnover" | "marketCap";
      sortDir: "asc" | "desc";
      limit: number;
      offset: number;
    }) => {
      try {
        const liveRows = await refreshAndPersistMarketWatch();
        const filteredRows = query.q
          ? liveRows.filter((row) => {
              const needle = query.q!.toLowerCase();
              return row.symbol.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle);
            })
          : liveRows;

        const sortedRows = [...filteredRows].sort((left, right) => {
          const leftValue = left[query.sortBy];
          const rightValue = right[query.sortBy];
          if (typeof leftValue === "string" || typeof rightValue === "string") {
            const result = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
            return query.sortDir === "asc" ? result : -result;
          }
          const result = (leftValue ?? Number.NEGATIVE_INFINITY) - (rightValue ?? Number.NEGATIVE_INFINITY);
          return query.sortDir === "asc" ? result : -result;
        });

        return {
          source: "live" as const,
          total: filteredRows.length,
          items: sortedRows.slice(query.offset, query.offset + query.limit)
        };
      } catch {
        const cached = await deps.cache.getJson<StoredMarketRow[]>("market:watch:latest");
        if (cached && cached.length > 0) {
          const filteredRows = query.q
            ? cached.filter((row) => {
                const needle = query.q!.toLowerCase();
                return row.symbol.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle);
              })
            : cached;
          return {
            source: "cache" as const,
            total: filteredRows.length,
            items: filteredRows.slice(query.offset, query.offset + query.limit)
          };
        }
        const stored = await repository.getMarketWatch(query);
        return { source: "database" as const, total: stored.total, items: stored.items };
      }
    },
    getQuoteWithFallback: async (symbol: string) => {
      try {
        const live = (await deps.cseClient.getCompanyInfoSummary(symbol)) as CompanyInfoSummary;
        const info = live.reqSymbolInfo;
        if (info?.symbol) {
          const row: StoredMarketRow = {
            id: null,
            name: String(info.name ?? info.symbol ?? symbol),
            symbol: String(info.symbol ?? symbol),
            price: toNumber(info.lastTradedPrice),
            previousClose: toNumber(info.previousClose),
            change: toNumber(info.change),
            changePercentage: toNumber(info.changePercentage),
            high: toNumber(info.hiTrade),
            low: toNumber(info.lowTrade),
            open: toNumber(info.open),
            sharevolume: toNumber(info.tdyShareVolume),
            tradevolume: null,
            turnover: null,
            marketCap: toNumber(info.marketCap),
            lastTradedTime: Date.now(),
            status: 1
          };
          await repository.saveMarketRows([row], new Date());
          await deps.cache.setJson(`quote:${symbol}`, live as never, 60 * 10);
        }
        return { source: "live" as const, quote: live };
      } catch {
        const cached = await deps.cache.getJson<CompanyInfoSummary>(`quote:${symbol}`);
        if (cached) return { source: "cache" as const, quote: cached };
        const stored = await repository.getStoredQuote(symbol);
        if (!stored) throw new Error(`No stored quote available for ${symbol}`);
        return { source: "database" as const, quote: stored };
      }
    },
    getRecommendationWithFallback: async (symbol: string) => {
      const quote = await (async () => {
        try {
          return (await deps.cseClient.getCompanyInfoSummary(symbol)) as CompanyInfoSummary;
        } catch {
          const cached = await deps.cache.getJson<CompanyInfoSummary>(`quote:${symbol}`);
          if (cached) return cached;
          const stored = await repository.getStoredQuote(symbol);
          if (!stored) throw new Error(`No stored quote available for ${symbol}`);
          return stored as CompanyInfoSummary;
        }
      })();
      return buildRecommendation(quote);
    },
    getHistoricalSeries: async (symbol: string, days: number) => repository.getHistoricalSeries(symbol, days)
  };
}

