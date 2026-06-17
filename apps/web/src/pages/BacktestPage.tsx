import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { runBacktest } from "../api/backtestingApi";

function buildSyntheticCandles(seedPrice: number): Array<{ time: string; close: number }> {
  return Array.from({ length: 80 }, (_, index) => {
    const wave = Math.sin(index / 5) * 3.2;
    const trend = index * 0.55;
    return {
      time: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
      close: Number((seedPrice + wave + trend).toFixed(2))
    };
  });
}

export function BacktestPage() {
  const [symbol, setSymbol] = useState("JKH.N0000");
  const [capital, setCapital] = useState(1_000_000);
  const [fastPeriod, setFastPeriod] = useState(5);
  const [slowPeriod, setSlowPeriod] = useState(20);

  const candles = useMemo(() => buildSyntheticCandles(symbol.startsWith("LOLC") ? 500 : symbol.startsWith("SAMP") ? 82 : 180), [symbol]);

  const mutation = useMutation({
    mutationFn: () =>
      runBacktest({
        stock_symbol: symbol,
        initial_capital: capital,
        fast_period: fastPeriod,
        slow_period: slowPeriod,
        candles
      })
  });

  return (
    <Stack gap={3.5}>
      <Card
        sx={{
          overflow: "hidden",
          background:
            "radial-gradient(circle at top right, rgba(99,164,255,0.18), transparent 26%), linear-gradient(135deg, rgba(15,25,42,0.96), rgba(9,17,29,0.96))"
        }}
      >
        <CardContent sx={{ p: { xs: 3, lg: 4 } }}>
          <Stack
            direction={{ xs: "column", xl: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", xl: "center" }}
            gap={2}
          >
            <Box>
              <Typography variant="overline" color="text.secondary">
                Strategy Research Environment
              </Typography>
              <Typography variant="h3">Backtesting Strategy Lab</Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 860 }}>
                Run scenario diagnostics across configurable moving-average logic, inspect equity progression, and review institutional-style performance cards for decision support.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.25} flexWrap="wrap">
              <Chip label="Execution Mode: Manual" color="primary" />
              <Chip label="Research Session Live" color="success" variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6">Backtest Parameters</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Configure symbol, capital base, and crossover windows before running the strategy engine.
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Stack gap={2} sx={{ mt: 2 }}>
                <TextField
                  select
                  label="Stock Symbol"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                >
                  {["JKH.N0000", "SAMP.N0000", "LOLC.N0000", "HAYL.N0000"].map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Initial Capital"
                  type="number"
                  value={capital}
                  onChange={(event) => setCapital(Number(event.target.value))}
                />
                <TextField
                  label="Fast SMA"
                  type="number"
                  value={fastPeriod}
                  onChange={(event) => setFastPeriod(Number(event.target.value))}
                />
                <TextField
                  label="Slow SMA"
                  type="number"
                  value={slowPeriod}
                  onChange={(event) => setSlowPeriod(Number(event.target.value))}
                />
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  sx={{ height: 52, borderRadius: 4 }}
                >
                  {mutation.isPending ? "Running..." : "Run Backtest"}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Current dataset uses synthesized market paths until full historical Timescale-backed ingestion is completed.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={8}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                <Box>
                  <Typography variant="h6">Performance Overview</Typography>
                  <Typography variant="body2" color="text.secondary">
                    High-level research output for the selected signal profile.
                  </Typography>
                </Box>
                <Chip label={`${symbol} | ${fastPeriod}/${slowPeriod} SMA`} variant="outlined" />
              </Stack>
              {!mutation.data && (
                <Box
                  sx={{
                    mt: 3,
                    minHeight: 360,
                    borderRadius: 5,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(255,255,255,0.02)",
                    border: "1px dashed rgba(164,186,223,0.12)"
                  }}
                >
                  <Typography color="text.secondary">
                    Trigger a backtest to view total return, win rate, Sharpe ratio, max drawdown, and the equity curve.
                  </Typography>
                </Box>
              )}
              {mutation.error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {(mutation.error as Error).message}
                </Alert>
              )}
              {mutation.isPending && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress sx={{ height: 10, borderRadius: 999 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Running strategy simulation and computing performance metrics...
                  </Typography>
                </Box>
              )}
              {mutation.data && (
                <Stack gap={2.5} sx={{ mt: 3 }}>
                  <Grid container spacing={2}>
                    {[
                      ["Total Return", `${(mutation.data.metrics.total_return * 100).toFixed(2)}%`],
                      ["Win Rate", `${(mutation.data.metrics.win_rate * 100).toFixed(2)}%`],
                      ["Profit Factor", mutation.data.metrics.profit_factor.toFixed(2)],
                      ["Max Drawdown", `${(mutation.data.metrics.max_drawdown * 100).toFixed(2)}%`]
                    ].map(([label, value]) => (
                      <Grid item xs={12} sm={6} xl={3} key={label}>
                        <Card
                          sx={{
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)"
                          }}
                        >
                          <CardContent>
                            <Typography color="text.secondary">{label}</Typography>
                            <Typography variant="h5" sx={{ mt: 0.5 }}>
                              {value}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid item xs={12} xl={8}>
                      <Card>
                        <CardContent>
                          <Typography variant="subtitle1">Equity Curve</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Strategy capital progression across the tested sample.
                          </Typography>
                          <Box sx={{ width: "100%", height: 320, mt: 2 }}>
                            <ResponsiveContainer>
                              <LineChart data={mutation.data.equity_curve}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                <XAxis dataKey="time" hide />
                                <YAxis />
                                <Tooltip />
                                <Line type="monotone" dataKey="equity" stroke="#63a4ff" strokeWidth={3} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} xl={4}>
                      <Card sx={{ height: "100%" }}>
                        <CardContent>
                          <Typography variant="subtitle1">Trade Summary</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Completed transactions generated by the current crossover logic.
                          </Typography>
                          <Divider sx={{ my: 2 }} />
                          <Stack gap={1.5}>
                            <Typography color="text.secondary">
                              Executed Trades
                              <Typography component="span" sx={{ ml: 1, color: "text.primary", fontWeight: 700 }}>
                                {mutation.data.trades.length}
                              </Typography>
                            </Typography>
                            <Typography color="text.secondary">
                              Sharpe Ratio
                              <Typography component="span" sx={{ ml: 1, color: "text.primary", fontWeight: 700 }}>
                                {mutation.data.metrics.sharpe_ratio.toFixed(2)}
                              </Typography>
                            </Typography>
                            <Typography color="text.secondary">
                              Strategy
                              <Typography component="span" sx={{ ml: 1, color: "text.primary", fontWeight: 700 }}>
                                {mutation.data.strategy.name}
                              </Typography>
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
