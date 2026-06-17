from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


Recommendation = Literal["BUY", "SELL", "HOLD"]


class Candle(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = Field(ge=0)


class RecommendationRequest(BaseModel):
    symbol: Optional[str] = None
    candles: List[Candle]
    sector_performance: Optional[float] = None


class RecommendationResponse(BaseModel):
    action: Recommendation
    confidence: float = Field(ge=0, le=100)
    reasons: List[str]
    metrics: dict


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


def _score_rsi(rsi: float) -> float:
    if np.isnan(rsi):
        return 0.0
    if rsi <= 30:
        return 1.0
    if rsi >= 70:
        return -1.0
    return (50 - rsi) / 20.0


def _score_macd(hist: float) -> float:
    if np.isnan(hist):
        return 0.0
    return float(np.tanh(hist))


app = FastAPI(title="AI Prediction Service", version="0.1.0")

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


@app.post("/recommendations/generate", response_model=RecommendationResponse)
def generate_recommendation(req: RecommendationRequest) -> RecommendationResponse:
    df = pd.DataFrame([c.model_dump() for c in req.candles]).sort_values("time")
    if df.shape[0] < 30:
        return RecommendationResponse(action="HOLD", confidence=50.0, reasons=["Insufficient history for stable indicators"], metrics={})

    close = df["close"].astype(float)
    rsi14 = _rsi(close, 14).iloc[-1]
    macd, macd_signal, macd_hist = _macd(close)
    macd_last = macd.iloc[-1]
    signal_last = macd_signal.iloc[-1]
    hist_last = macd_hist.iloc[-1]

    rsi_score = _score_rsi(float(rsi14))
    macd_score = _score_macd(float(hist_last))
    sector_score = 0.0
    if req.sector_performance is not None:
        sector_score = float(np.tanh(req.sector_performance / 5.0))

    combined = 0.55 * rsi_score + 0.35 * macd_score + 0.10 * sector_score

    reasons: List[str] = []
    action: Recommendation = "HOLD"

    if float(rsi14) <= 30:
        reasons.append("RSI indicates oversold conditions")
    elif float(rsi14) >= 70:
        reasons.append("RSI indicates overbought conditions")

    if hist_last > 0 and macd_last > signal_last:
        reasons.append("MACD bullish momentum (MACD above signal)")
    elif hist_last < 0 and macd_last < signal_last:
        reasons.append("MACD bearish momentum (MACD below signal)")

    if req.sector_performance is not None:
        if req.sector_performance > 0:
            reasons.append("Sector trend is positive")
        elif req.sector_performance < 0:
            reasons.append("Sector trend is negative")

    if combined >= 0.35:
        action = "BUY"
    elif combined <= -0.35:
        action = "SELL"
    else:
        action = "HOLD"

    confidence = float(np.clip(50.0 + 45.0 * abs(combined), 0.0, 100.0))

    metrics = {
        "rsi_14": None if np.isnan(rsi14) else float(rsi14),
        "macd": None if np.isnan(macd_last) else float(macd_last),
        "macd_signal": None if np.isnan(signal_last) else float(signal_last),
        "macd_hist": None if np.isnan(hist_last) else float(hist_last),
        "score": float(combined),
    }

    if not reasons:
        reasons = ["Signals are mixed; no strong edge detected"]

    return RecommendationResponse(action=action, confidence=confidence, reasons=reasons, metrics=metrics)
