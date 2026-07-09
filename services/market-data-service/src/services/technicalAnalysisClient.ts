import { env } from "../serverEnv.js";

export type IndicatorResponse = {
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

export type IndicatorCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function computeIndicators(candles: IndicatorCandle[]): Promise<IndicatorResponse> {
  const response = await fetch(`${env.TECHNICAL_ANALYSIS_URL}/indicators/compute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ candles })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Technical analysis service error: ${text.slice(0, 200)}`);
  }

  return (await response.json()) as IndicatorResponse;
}

