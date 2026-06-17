from __future__ import annotations

from typing import List

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .engine import Candle, run_backtest as run_engine_backtest


class BacktestCandle(BaseModel):
    time: str
    close: float = Field(gt=0)


class BacktestRequest(BaseModel):
    stock_symbol: str
    initial_capital: float = Field(gt=0)
    strategy: str = Field(default="SMA_CROSSOVER")
    fast_period: int = Field(default=5, ge=2)
    slow_period: int = Field(default=20, ge=3)
    rsi_period: int = Field(default=14, ge=2)
    rsi_oversold: float = Field(default=30.0, ge=1.0, le=50.0)
    rsi_overbought: float = Field(default=70.0, ge=50.0, le=99.0)
    position_size_pct: float = Field(default=1.0, ge=0.05, le=1.0)
    slippage_bps: float = Field(default=0.0, ge=0.0, le=500.0)
    fee_mode: str = Field(default="BOTH")
    buy_fee_rate_pct: float = Field(default=1.12, ge=0.0, le=10.0)
    sell_fee_rate_pct: float = Field(default=1.12, ge=0.0, le=10.0)
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
    if req.strategy.upper() == "SMA_CROSSOVER" and req.fast_period >= req.slow_period:
        raise HTTPException(status_code=400, detail="fast_period must be less than slow_period")

    candles = [Candle(time=c.time, close=c.close) for c in req.candles]
    result = run_engine_backtest(
        candles=candles,
        initial_capital=req.initial_capital,
        strategy=req.strategy,
        fast_period=req.fast_period,
        slow_period=req.slow_period,
        rsi_period=req.rsi_period,
        rsi_oversold=req.rsi_oversold,
        rsi_overbought=req.rsi_overbought,
        position_size_pct=req.position_size_pct,
        slippage_bps=req.slippage_bps,
        buy_fee_rate=req.buy_fee_rate_pct / 100.0,
        sell_fee_rate=req.sell_fee_rate_pct / 100.0,
        fee_mode=req.fee_mode,
    )
    result["stock_symbol"] = req.stock_symbol
    result["strategy"] = {
        "name": req.strategy.upper(),
        "fast_period": req.fast_period,
        "slow_period": req.slow_period,
        "rsi_period": req.rsi_period,
        "rsi_oversold": req.rsi_oversold,
        "rsi_overbought": req.rsi_overbought,
        "position_size_pct": req.position_size_pct,
        "slippage_bps": req.slippage_bps,
        "fee_mode": req.fee_mode,
        "buy_fee_rate_pct": req.buy_fee_rate_pct,
        "sell_fee_rate_pct": req.sell_fee_rate_pct,
    }
    return result
