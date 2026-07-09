import { httpClient } from "./httpClient";

const BACKTESTING_BASE_URL = import.meta.env.VITE_BACKTESTING_BASE_URL as string | undefined;
const MARKET_DATA_BASE_URL = import.meta.env.VITE_MARKET_DATA_BASE_URL as string | undefined;

export type BacktestRequest = {
  stock_symbol: string;
  initial_capital: number;
  strategy?: "SMA_CROSSOVER" | "RSI_REVERSION";
  fast_period: number;
  slow_period: number;
  rsi_period?: number;
  rsi_oversold?: number;
  rsi_overbought?: number;
  position_size_pct?: number;
  slippage_bps?: number;
  fee_mode?: "BOTH" | "SELL_ONLY" | "BUY_ONLY" | "NONE";
  buy_fee_rate_pct?: number;
  sell_fee_rate_pct?: number;
  candles: Array<{
    time: string;
    close: number;
  }>;
};

export type BacktestResponse = {
  stock_symbol: string;
  strategy: {
    name: string;
    fast_period: number;
    slow_period: number;
  };
  metrics: {
    total_return: number;
    win_rate: number;
    profit_factor: number;
    sharpe_ratio: number;
    max_drawdown: number;
    total_fees?: number;
    trade_count?: number;
  };
  trades: Array<{
    entry_time: string;
    exit_time: string;
    entry_price: number;
    exit_price: number;
    shares: number;
    entry_fees?: number;
    exit_fees?: number;
    pnl: number;
    return_pct: number;
  }>;
  equity_curve: Array<{
    time: string;
    equity: number;
  }>;
};

export type SavedBacktestRun = {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
  metrics: BacktestResponse["metrics"];
  equity_curve: BacktestResponse["equity_curve"];
  trades: BacktestResponse["trades"];
  started_at: string;
  ended_at: string;
  created_at: string;
};

function requireBaseUrl(): string {
  if (!BACKTESTING_BASE_URL) {
    throw new Error("VITE_BACKTESTING_BASE_URL is not set");
  }
  return BACKTESTING_BASE_URL;
}

function requireMarketBaseUrl(): string {
  if (!MARKET_DATA_BASE_URL) {
    throw new Error("VITE_MARKET_DATA_BASE_URL is not set");
  }
  return MARKET_DATA_BASE_URL;
}

export async function runBacktest(payload: BacktestRequest): Promise<BacktestResponse> {
  const res = await fetch(`${requireBaseUrl()}/backtests/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return (await res.json()) as BacktestResponse;
}

export function fetchSavedBacktests(): Promise<SavedBacktestRun[]> {
  return httpClient.getJson<SavedBacktestRun[]>(`${requireMarketBaseUrl()}/api/backtests`);
}

export function saveBacktestRun(payload: {
  name: string;
  startedAt: string;
  endedAt: string;
  parameters: Record<string, unknown>;
  metrics: BacktestResponse["metrics"];
  equityCurve: BacktestResponse["equity_curve"];
  trades: BacktestResponse["trades"];
}): Promise<{ id: string }> {
  return httpClient.requestJson<{ id: string }>(`${requireMarketBaseUrl()}/api/backtests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function deleteSavedBacktest(id: string): Promise<void> {
  return httpClient.requestJson<void>(`${requireMarketBaseUrl()}/api/backtests/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export const backtestingApi = { runBacktest, fetchSavedBacktests, saveBacktestRun, deleteSavedBacktest, getJson: httpClient.getJson };
