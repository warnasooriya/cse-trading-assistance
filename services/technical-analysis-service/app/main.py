from __future__ import annotations

from datetime import datetime
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class Candle(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = Field(ge=0)


class IndicatorRequest(BaseModel):
    candles: List[Candle]


class IndicatorResponse(BaseModel):
    rsi_14: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    ema_12: Optional[float] = None
    ema_26: Optional[float] = None
    sma_20: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    atr_14: Optional[float] = None
    vwap: Optional[float] = None
    stoch_k: Optional[float] = None
    stoch_d: Optional[float] = None
    explanations: dict


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def _macd(close: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    macd = ema12 - ema26
    signal = _ema(macd, 9)
    hist = macd - signal
    return macd, signal, hist


def _bollinger(close: pd.Series, period: int = 20, std: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = close.rolling(period).mean()
    sd = close.rolling(period).std()
    upper = mid + std * sd
    lower = mid - std * sd
    return upper, mid, lower


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def _vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    typical = (high + low + close) / 3.0
    cum_vol = volume.cumsum().replace(0, np.nan)
    return (typical * volume).cumsum() / cum_vol


def _stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k_period: int = 14, d_period: int = 3) -> tuple[pd.Series, pd.Series]:
    lowest = low.rolling(k_period).min()
    highest = high.rolling(k_period).max()
    k = 100 * (close - lowest) / (highest - lowest).replace(0, np.nan)
    d = k.rolling(d_period).mean()
    return k, d


app = FastAPI(title="Technical Analysis Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/indicators/compute", response_model=IndicatorResponse)
def compute_indicators(req: IndicatorRequest) -> IndicatorResponse:
    df = pd.DataFrame([c.model_dump() for c in req.candles]).sort_values("time")
    if df.empty:
        return IndicatorResponse(explanations={})

    high = df["high"].astype(float)
    low = df["low"].astype(float)
    close = df["close"].astype(float)
    volume = df["volume"].astype(float)

    rsi14 = _rsi(close, 14)
    macd, macd_signal, macd_hist = _macd(close)
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    sma20 = close.rolling(20).mean()
    bb_u, bb_m, bb_l = _bollinger(close, 20, 2.0)
    atr14 = _atr(high, low, close, 14)
    vwap = _vwap(high, low, close, volume)
    stoch_k, stoch_d = _stochastic(high, low, close, 14, 3)

    explanations = {
        "RSI": "Relative Strength Index (14): <30 oversold, >70 overbought.",
        "MACD": "MACD (12,26,9): bullish when MACD crosses above signal.",
        "EMA": "Exponential Moving Average: weights recent prices more.",
        "SMA": "Simple Moving Average (20): average of last 20 closes.",
        "BOLLINGER": "Bollinger Bands (20,2σ): price near lower band may indicate oversold.",
        "ATR": "Average True Range (14): measures volatility; higher means more volatility.",
        "VWAP": "Volume Weighted Average Price: average price weighted by volume.",
        "STOCHASTIC": "Stochastic Oscillator (14,3): <20 oversold, >80 overbought."
    }

    def last(series: pd.Series) -> Optional[float]:
        v = series.iloc[-1]
        return None if pd.isna(v) else float(v)

    return IndicatorResponse(
        rsi_14=last(rsi14),
        macd=last(macd),
        macd_signal=last(macd_signal),
        macd_hist=last(macd_hist),
        ema_12=last(ema12),
        ema_26=last(ema26),
        sma_20=last(sma20),
        bb_upper=last(bb_u),
        bb_middle=last(bb_m),
        bb_lower=last(bb_l),
        atr_14=last(atr14),
        vwap=last(vwap),
        stoch_k=last(stoch_k),
        stoch_d=last(stoch_d),
        explanations=explanations,
    )
