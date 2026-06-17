import { httpClient } from "./httpClient";

const MARKET_DATA_BASE_URL = import.meta.env.VITE_MARKET_DATA_BASE_URL as string | undefined;

function requireBaseUrl(): string {
  if (!MARKET_DATA_BASE_URL) {
    throw new Error("VITE_MARKET_DATA_BASE_URL is not set");
  }
  return MARKET_DATA_BASE_URL;
}

export type StockQuoteResponse = {
  source?: "live" | "cache" | "database";
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
};

export type StockHistoryResponse = {
  symbol: string;
  range: "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";
  items: Array<{ time: string; close: number | null }>;
};

export type RecommendationResponse = {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasons: string[];
  metrics: Record<string, number | null>;
};

export function fetchStockQuote(symbol: string): Promise<StockQuoteResponse> {
  return httpClient.getJson<StockQuoteResponse>(`${requireBaseUrl()}/api/stocks/${encodeURIComponent(symbol)}/quote`);
}

export function fetchStockRecommendation(symbol: string): Promise<RecommendationResponse> {
  return httpClient.getJson<RecommendationResponse>(
    `${requireBaseUrl()}/api/stocks/${encodeURIComponent(symbol)}/recommendation`
  );
}

export function fetchStockHistory(symbol: string, range: StockHistoryResponse["range"]): Promise<StockHistoryResponse> {
  return httpClient.getJson<StockHistoryResponse>(
    `${requireBaseUrl()}/api/stocks/${encodeURIComponent(symbol)}/history?range=${encodeURIComponent(range)}`
  );
}
