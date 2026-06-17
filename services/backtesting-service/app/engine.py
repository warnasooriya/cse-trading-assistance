from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from statistics import mean
from typing import Iterable, List


@dataclass
class Candle:
    time: str
    close: float


@dataclass
class BacktestTrade:
    entry_time: str
    exit_time: str
    entry_price: float
    exit_price: float
    shares: float
    pnl: float
    return_pct: float


def _moving_average(values: List[float], window: int, index: int) -> float | None:
    if index + 1 < window:
      return None
    subset = values[index - window + 1 : index + 1]
    return sum(subset) / window


def run_sma_crossover_backtest(
    candles: Iterable[Candle],
    initial_capital: float,
    fast_period: int = 5,
    slow_period: int = 20,
) -> dict:
    series = list(candles)
    if len(series) < slow_period + 2:
        return {
            "metrics": {
                "total_return": 0.0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "sharpe_ratio": 0.0,
                "max_drawdown": 0.0,
            },
            "trades": [],
            "equity_curve": [{"time": c.time, "equity": initial_capital} for c in series],
        }

    closes = [c.close for c in series]
    cash = initial_capital
    shares = 0.0
    entry_price = 0.0
    entry_time = ""
    trades: list[BacktestTrade] = []
    equity_curve: list[dict] = []
    equity_returns: list[float] = []
    prev_equity = initial_capital

    for index, candle in enumerate(series):
        fast_ma = _moving_average(closes, fast_period, index)
        slow_ma = _moving_average(closes, slow_period, index)
        prev_fast = _moving_average(closes, fast_period, index - 1) if index > 0 else None
        prev_slow = _moving_average(closes, slow_period, index - 1) if index > 0 else None

        buy_signal = (
            prev_fast is not None
            and prev_slow is not None
            and fast_ma is not None
            and slow_ma is not None
            and prev_fast <= prev_slow
            and fast_ma > slow_ma
        )
        sell_signal = (
            prev_fast is not None
            and prev_slow is not None
            and fast_ma is not None
            and slow_ma is not None
            and prev_fast >= prev_slow
            and fast_ma < slow_ma
        )

        if buy_signal and shares == 0 and candle.close > 0:
            shares = cash / candle.close
            cash = 0.0
            entry_price = candle.close
            entry_time = candle.time
        elif sell_signal and shares > 0:
            exit_value = shares * candle.close
            pnl = exit_value - shares * entry_price
            return_pct = (candle.close - entry_price) / entry_price if entry_price else 0.0
            trades.append(
                BacktestTrade(
                    entry_time=entry_time,
                    exit_time=candle.time,
                    entry_price=entry_price,
                    exit_price=candle.close,
                    shares=shares,
                    pnl=pnl,
                    return_pct=return_pct,
                )
            )
            cash = exit_value
            shares = 0.0
            entry_price = 0.0
            entry_time = ""

        equity = cash + shares * candle.close
        equity_curve.append({"time": candle.time, "equity": equity})
        equity_returns.append((equity - prev_equity) / prev_equity if prev_equity else 0.0)
        prev_equity = equity

    if shares > 0:
        last = series[-1]
        exit_value = shares * last.close
        pnl = exit_value - shares * entry_price
        return_pct = (last.close - entry_price) / entry_price if entry_price else 0.0
        trades.append(
            BacktestTrade(
                entry_time=entry_time,
                exit_time=last.time,
                entry_price=entry_price,
                exit_price=last.close,
                shares=shares,
                pnl=pnl,
                return_pct=return_pct,
            )
        )
        cash = exit_value
        equity_curve[-1]["equity"] = cash

    ending_equity = cash
    total_return = (ending_equity - initial_capital) / initial_capital if initial_capital else 0.0
    wins = [trade for trade in trades if trade.pnl > 0]
    losses = [trade for trade in trades if trade.pnl < 0]
    gross_profit = sum(trade.pnl for trade in wins)
    gross_loss = abs(sum(trade.pnl for trade in losses))
    profit_factor = gross_profit / gross_loss if gross_loss else gross_profit if gross_profit else 0.0
    win_rate = len(wins) / len(trades) if trades else 0.0

    avg_return = mean(equity_returns) if equity_returns else 0.0
    variance = mean([(r - avg_return) ** 2 for r in equity_returns]) if equity_returns else 0.0
    volatility = variance ** 0.5
    sharpe_ratio = (avg_return / volatility) * sqrt(252) if volatility else 0.0

    peak = initial_capital
    max_drawdown = 0.0
    for point in equity_curve:
        peak = max(peak, point["equity"])
        if peak > 0:
            drawdown = (peak - point["equity"]) / peak
            max_drawdown = max(max_drawdown, drawdown)

    return {
        "metrics": {
            "total_return": round(total_return, 6),
            "win_rate": round(win_rate, 6),
            "profit_factor": round(profit_factor, 6),
            "sharpe_ratio": round(sharpe_ratio, 6),
            "max_drawdown": round(max_drawdown, 6),
        },
        "trades": [trade.__dict__ for trade in trades],
        "equity_curve": equity_curve,
    }

