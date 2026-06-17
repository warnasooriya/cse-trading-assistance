import unittest

from app.engine import Candle, run_sma_crossover_backtest


class BacktestEngineTests(unittest.TestCase):
    def test_generates_positive_return_on_uptrend(self):
        candles = [Candle(time=f"2026-01-{day:02d}", close=100 + day) for day in range(1, 40)]
        result = run_sma_crossover_backtest(candles, initial_capital=100000, fast_period=3, slow_period=5)

        self.assertIn("metrics", result)
        self.assertGreaterEqual(result["metrics"]["total_return"], 0)
        self.assertGreaterEqual(len(result["equity_curve"]), len(candles))

    def test_handles_short_series_without_failure(self):
        candles = [Candle(time="2026-01-01", close=100), Candle(time="2026-01-02", close=101)]
        result = run_sma_crossover_backtest(candles, initial_capital=50000)

        self.assertEqual(result["metrics"]["total_return"], 0.0)
        self.assertEqual(result["trades"], [])


if __name__ == "__main__":
    unittest.main()

