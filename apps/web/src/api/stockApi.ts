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

export type StockIndicatorsResponse = {
  symbol: string;
  range: StockHistoryResponse["range"];
  indicators: {
    rsi_14?: number | null;
    macd?: number | null;
    macd_signal?: number | null;
    macd_hist?: number | null;
    ema_12?: number | null;
    ema_26?: number | null;
    sma_20?: number | null;
    bb_upper?: number | null;
    bb_middle?: number | null;
    bb_lower?: number | null;
    atr_14?: number | null;
    vwap?: number | null;
    stoch_k?: number | null;
    stoch_d?: number | null;
    explanations?: Record<string, string>;
  };
};

export type StockCopilotResponse = {
  symbol: string;
  range: StockHistoryResponse["range"];
  indicators: StockIndicatorsResponse["indicators"];
  recommendation: RecommendationResponse;
  copilot: {
    summary: string;
    entryPlan: string[];
    exitPlan: string[];
    risks: string[];
    actionItems: string[];
    confidenceNote: string;
  };
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

export function fetchStockIndicators(symbol: string, range: StockHistoryResponse["range"]): Promise<StockIndicatorsResponse> {
  return httpClient.getJson<StockIndicatorsResponse>(
    `${requireBaseUrl()}/api/stocks/${encodeURIComponent(symbol)}/indicators?range=${encodeURIComponent(range)}`
  );
}

export function fetchStockCopilot(symbol: string, range: StockHistoryResponse["range"]): Promise<StockCopilotResponse> {
  return httpClient.requestJson<StockCopilotResponse>(`${requireBaseUrl()}/api/stocks/${encodeURIComponent(symbol)}/copilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ range })
  });
}
