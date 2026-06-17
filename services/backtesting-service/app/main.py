from __future__ import annotations

from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .engine import Candle, run_sma_crossover_backtest


class BacktestCandle(BaseModel):
    time: str
    close: float = Field(gt=0)


class BacktestRequest(BaseModel):
    stock_symbol: str
    initial_capital: float = Field(gt=0)
    fast_period: int = Field(default=5, ge=2)
    slow_period: int = Field(default=20, ge=3)
    candles: List[BacktestCandle]


app = FastAPI(title="Backtesting Service", version="0.1.0")

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


@app.post("/backtests/run")
def run_backtest(req: BacktestRequest) -> dict:
    candles = [Candle(time=c.time, close=c.close) for c in req.candles]
    result = run_sma_crossover_backtest(
        candles=candles,
        initial_capital=req.initial_capital,
        fast_period=req.fast_period,
        slow_period=req.slow_period,
    )
    result["stock_symbol"] = req.stock_symbol
    result["strategy"] = {
        "name": "SMA_CROSSOVER",
        "fast_period": req.fast_period,
        "slow_period": req.slow_period,
    }
    return result
