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
    entry_fees: float
    exit_fees: float
    pnl: float
    return_pct: float


def _moving_average(values: List[float], window: int, index: int) -> float | None:
    if index + 1 < window:
      return None
    subset = values[index - window + 1 : index + 1]
    return sum(subset) / window


def _rsi(values: List[float], period: int, index: int) -> float | None:
    if index < period:
        return None

    gains = 0.0
    losses = 0.0
    for i in range(index - period + 1, index + 1):
        diff = values[i] - values[i - 1]
        if diff > 0:
            gains += diff
        elif diff < 0:
            losses += abs(diff)

    avg_gain = gains / period
    avg_loss = losses / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _rates_from_fee_mode(buy_rate: float, sell_rate: float, fee_mode: str) -> tuple[float, float]:
    mode = (fee_mode or "BOTH").upper()
    if mode == "NONE":
        return 0.0, 0.0
    if mode == "BUY_ONLY":
        return max(0.0, buy_rate), 0.0
    if mode == "SELL_ONLY":
        return 0.0, max(0.0, sell_rate)
    return max(0.0, buy_rate), max(0.0, sell_rate)


def run_backtest(
    candles: Iterable[Candle],
    initial_capital: float,
    strategy: str,
    fast_period: int = 5,
    slow_period: int = 20,
    rsi_period: int = 14,
    rsi_oversold: float = 30.0,
    rsi_overbought: float = 70.0,
    position_size_pct: float = 1.0,
    slippage_bps: float = 0.0,
    buy_fee_rate: float = 0.0,
    sell_fee_rate: float = 0.0,
    fee_mode: str = "BOTH",
) -> dict:
    series = list(candles)
    if not series:
        return {
            "metrics": {
                "total_return": 0.0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "sharpe_ratio": 0.0,
                "max_drawdown": 0.0,
                "total_fees": 0.0,
                "trade_count": 0,
            },
            "trades": [],
            "equity_curve": [],
        }

    strat = (strategy or "SMA_CROSSOVER").upper()
    min_len = slow_period + 2 if strat == "SMA_CROSSOVER" else rsi_period + 2
    if len(series) < min_len:
        return {
            "metrics": {
                "total_return": 0.0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "sharpe_ratio": 0.0,
                "max_drawdown": 0.0,
                "total_fees": 0.0,
                "trade_count": 0,
            },
            "trades": [],
            "equity_curve": [{"time": c.time, "equity": initial_capital} for c in series],
        }

    closes = [c.close for c in series]
    cash = initial_capital
    shares = 0.0
    entry_price = 0.0
    entry_cost = 0.0
    entry_fees = 0.0
    entry_time = ""
    trades: list[BacktestTrade] = []
    equity_curve: list[dict] = []
    equity_returns: list[float] = []
    prev_equity = initial_capital
    total_fees = 0.0
    allocation = max(0.0, min(1.0, float(position_size_pct)))
    slippage = max(0.0, float(slippage_bps)) / 10_000.0
    buy_fee_rate, sell_fee_rate = _rates_from_fee_mode(float(buy_fee_rate), float(sell_fee_rate), fee_mode)

    for index, candle in enumerate(series):
        buy_signal = False
        sell_signal = False

        if strat == "SMA_CROSSOVER":
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
        elif strat == "RSI_REVERSION":
            rsi = _rsi(closes, rsi_period, index)
            buy_signal = rsi is not None and rsi <= rsi_oversold
            sell_signal = rsi is not None and rsi >= rsi_overbought

        if buy_signal and shares == 0 and candle.close > 0:
            exec_price = candle.close * (1.0 + slippage)
            budget = cash * allocation
            denom = exec_price * (1.0 + buy_fee_rate)
            shares = (budget / denom) if denom > 0 else 0.0
            buy_gross = shares * exec_price
            fees = buy_gross * buy_fee_rate
            cost = buy_gross + fees
            cash = max(0.0, cash - cost)
            entry_price = exec_price
            entry_cost = cost
            entry_fees = fees
            total_fees += fees
            entry_time = candle.time
        elif sell_signal and shares > 0:
            exec_price = candle.close * (1.0 - slippage)
            sell_gross = shares * exec_price
            fees = sell_gross * sell_fee_rate
            exit_value = sell_gross - fees
            pnl = exit_value - entry_cost
            return_pct = (pnl / entry_cost) if entry_cost else 0.0
            trades.append(
                BacktestTrade(
                    entry_time=entry_time,
                    exit_time=candle.time,
                    entry_price=entry_price,
                    exit_price=exec_price,
                    shares=shares,
                    entry_fees=entry_fees,
                    exit_fees=fees,
                    pnl=pnl,
                    return_pct=return_pct,
                )
            )
            cash = cash + exit_value
            shares = 0.0
            entry_price = 0.0
            entry_cost = 0.0
            entry_fees = 0.0
            entry_time = ""
            total_fees += fees

        liquidation_value = shares * candle.close * (1.0 - sell_fee_rate) if shares > 0 else 0.0
        equity = cash + liquidation_value
        equity_curve.append({"time": candle.time, "equity": equity})
        equity_returns.append((equity - prev_equity) / prev_equity if prev_equity else 0.0)
        prev_equity = equity

    if shares > 0:
        last = series[-1]
        exec_price = last.close * (1.0 - slippage)
        sell_gross = shares * exec_price
        fees = sell_gross * sell_fee_rate
        exit_value = sell_gross - fees
        pnl = exit_value - entry_cost
        return_pct = (pnl / entry_cost) if entry_cost else 0.0
        trades.append(
            BacktestTrade(
                entry_time=entry_time,
                exit_time=last.time,
                entry_price=entry_price,
                exit_price=exec_price,
                shares=shares,
                entry_fees=entry_fees,
                exit_fees=fees,
                pnl=pnl,
                return_pct=return_pct,
            )
        )
        cash = cash + exit_value
        total_fees += fees
        equity_curve[-1]["equity"] = cash
        shares = 0.0

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
            "total_fees": round(total_fees, 6),
            "trade_count": len(trades),
        },
        "trades": [trade.__dict__ for trade in trades],
        "equity_curve": equity_curve,
    }


def run_sma_crossover_backtest(
    candles: Iterable[Candle],
    initial_capital: float,
    fast_period: int = 5,
    slow_period: int = 20,
    position_size_pct: float = 1.0,
    slippage_bps: float = 0.0,
    buy_fee_rate: float = 0.0,
    sell_fee_rate: float = 0.0,
    fee_mode: str = "BOTH",
) -> dict:
    return run_backtest(
        candles=candles,
        initial_capital=initial_capital,
        strategy="SMA_CROSSOVER",
        fast_period=fast_period,
        slow_period=slow_period,
        position_size_pct=position_size_pct,
        slippage_bps=slippage_bps,
        buy_fee_rate=buy_fee_rate,
        sell_fee_rate=sell_fee_rate,
        fee_mode=fee_mode,
    )
