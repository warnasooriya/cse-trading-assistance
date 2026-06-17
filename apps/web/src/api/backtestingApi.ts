import { httpClient } from "./httpClient";

const BACKTESTING_BASE_URL = import.meta.env.VITE_BACKTESTING_BASE_URL as string | undefined;

export type BacktestRequest = {
  stock_symbol: string;
  initial_capital: number;
  fast_period: number;
  slow_period: number;
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
  };
  trades: Array<{
    entry_time: string;
    exit_time: string;
    entry_price: number;
    exit_price: number;
    shares: number;
    pnl: number;
    return_pct: number;
  }>;
  equity_curve: Array<{
    time: string;
    equity: number;
  }>;
};

function requireBaseUrl(): string {
  if (!BACKTESTING_BASE_URL) {
    throw new Error("VITE_BACKTESTING_BASE_URL is not set");
  }
  return BACKTESTING_BASE_URL;
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

export const backtestingApi = { runBacktest, getJson: httpClient.getJson };

