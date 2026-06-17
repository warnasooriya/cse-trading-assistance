import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
import type { BacktestResponse } from "../api/backtestingApi";
import { fetchMarketWatch } from "../api/marketDataApi";
import type { MarketWatchItem } from "../api/marketDataApi";
import { fetchStockHistory } from "../api/stockApi";
import type { StockHistoryResponse } from "../api/stockApi";

type Strategy = "SMA_CROSSOVER" | "RSI_REVERSION";
type FeeMode = "BOTH" | "SELL_ONLY" | "BUY_ONLY" | "NONE";
type ResultsTab = "overview" | "equity" | "trades";
type AutoSimulationCandidate = {
  strategy: Strategy;
  label: string;
  score: number;
  result: BacktestResponse;
  fastPeriod?: number;
  slowPeriod?: number;
  rsiPeriod?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
};

function toCsv(rows: Array<Record<string, string | number | null | undefined>>): string {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((key) => {
          const v = row[key];
          if (v === null || v === undefined) return "";
          if (typeof v === "number") return String(Number.isFinite(v) ? v : "");
          return escape(String(v));
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getScoreTone(score: number): "success" | "info" | "warning" | "error" {
  if (score >= 75) return "success";
  if (score >= 55) return "info";
  if (score >= 35) return "warning";
  return "error";
}

function calculateProfitabilityScore(result: BacktestResponse): number {
  const totalReturnPct = result.metrics.total_return * 100;
  const maxDrawdownPct = result.metrics.max_drawdown * 100;
  const profitFactor = result.metrics.profit_factor;
  const sharpe = result.metrics.sharpe_ratio;
  const trades = result.metrics.trade_count ?? result.trades.length;

  let score = 50;
  score += Math.max(-20, Math.min(25, totalReturnPct * 1.2));
  score += Math.max(-10, Math.min(15, (profitFactor - 1) * 10));
  score += Math.max(-10, Math.min(10, sharpe * 4));
  score -= Math.max(0, Math.min(18, maxDrawdownPct * 0.6));
  score -= trades > 18 ? Math.min(10, (trades - 18) * 0.5) : 0;
  score += trades >= 3 && trades <= 15 ? 6 : 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildProfitabilityInsights(params: {
  result: Awaited<ReturnType<typeof runBacktest>>;
  strategy: Strategy;
  feeMode: FeeMode;
  fastPeriod: number;
  slowPeriod: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  positionSizePct: number;
  slippageBps: number;
}) {
  const { result, strategy, feeMode, fastPeriod, slowPeriod, rsiPeriod, rsiOversold, rsiOverbought, positionSizePct, slippageBps } = params;
  const totalReturnPct = result.metrics.total_return * 100;
  const winRatePct = result.metrics.win_rate * 100;
  const maxDrawdownPct = result.metrics.max_drawdown * 100;
  const profitFactor = result.metrics.profit_factor;
  const fees = result.metrics.total_fees ?? 0;
  const trades = result.metrics.trade_count ?? result.trades.length;

  const score = calculateProfitabilityScore(result);

  const insights: Array<{
    severity: "success" | "info" | "warning" | "error";
    title: string;
    description: string;
  }> = [];

  if (totalReturnPct > 8 && profitFactor > 1.2 && maxDrawdownPct < 15) {
    insights.push({
      severity: "success",
      title: "Profitable setup detected",
      description: "This configuration shows positive return with acceptable drawdown. It is a good candidate for deeper testing across more date ranges."
    });
  } else if (totalReturnPct <= 0) {
    insights.push({
      severity: "error",
      title: "Strategy is not profitable on this sample",
      description: "Current settings lose money after simulation. Try another strategy, longer dataset, or reduce trade frequency."
    });
  } else {
    insights.push({
      severity: "info",
      title: "Mixed but usable results",
      description: "The setup has some edge, but it needs refinement before treating it as a strong trading model."
    });
  }

  if (maxDrawdownPct >= 20) {
    insights.push({
      severity: "warning",
      title: "Drawdown is high",
      description: `Max drawdown is ${maxDrawdownPct.toFixed(2)}%. Consider lowering position size from ${positionSizePct}% or using slower signals to reduce risk.`
    });
  }

  if (fees > 0 && totalReturnPct > 0 && fees > Math.abs(totalReturnPct) * 500) {
    insights.push({
      severity: "warning",
      title: "Fees are hurting profitability",
      description: "Transaction costs are large relative to performance. Fewer trades or wider signal thresholds can improve net profitability."
    });
  } else if (trades >= 14) {
    insights.push({
      severity: "warning",
      title: "Trade frequency is high",
      description: "Too many trades usually increase fee drag. Prefer slower entries or a longer lookback to avoid noisy signals."
    });
  }

  if (winRatePct < 40 && profitFactor > 1.1) {
    insights.push({
      severity: "info",
      title: "Low win rate but winners are larger",
      description: "This strategy can still work if losing trades remain small. Monitor drawdown and keep fees under control."
    });
  }

  if (strategy === "SMA_CROSSOVER") {
    const spread = slowPeriod - fastPeriod;
    if (spread < 12) {
      insights.push({
        severity: "info",
        title: "Increase the SMA gap",
        description: `Fast ${fastPeriod} / Slow ${slowPeriod} is relatively tight. A wider gap can filter false signals and improve net return after costs.`
      });
    } else {
      insights.push({
        severity: "success",
        title: "Signal smoothing looks balanced",
        description: "The gap between fast and slow SMA is large enough to reduce some market noise."
      });
    }
  } else {
    if (rsiOversold >= 30 || rsiOverbought <= 70) {
      insights.push({
        severity: "info",
        title: "RSI thresholds can be stronger",
        description: `Try tighter reversal zones such as ${Math.max(20, rsiOversold - 5)}/${Math.min(80, rsiOverbought + 5)} to avoid weaker signals.`
      });
    } else {
      insights.push({
        severity: "success",
        title: "RSI thresholds are selective",
        description: `RSI ${rsiPeriod} with ${rsiOversold}/${rsiOverbought} is relatively strict and can help reduce overtrading.`
      });
    }
  }

  if (feeMode === "BOTH" && slippageBps <= 2) {
    insights.push({
      severity: "info",
      title: "Execution assumptions are optimistic",
      description: "Real fills often include more slippage. Test again with 5-10 bps to check whether profitability is robust."
    });
  }

  const nextActions: string[] = [];
  if (totalReturnPct <= 0 || profitFactor < 1) {
    nextActions.push("Switch strategy and compare the same symbol over 1Y and 5Y ranges.");
  }
  if (maxDrawdownPct > 15) {
    nextActions.push("Lower position size to 40%-60% and re-run to improve survivability.");
  }
  if (trades > 12) {
    nextActions.push("Reduce trade churn by widening signals or using a longer history range.");
  }
  if (feeMode !== "NONE") {
    nextActions.push("Run a second pass with Sell Only fee mode if your broker charges only one side for intraday.");
  }
  if (nextActions.length === 0) {
    nextActions.push("Validate this promising setup across multiple symbols and date ranges before using it live.");
  }

  return {
    score,
    tone: getScoreTone(score),
    headline:
      score >= 75
        ? "High profitability potential"
        : score >= 55
          ? "Moderate profitability potential"
          : score >= 35
            ? "Caution: setup needs optimization"
            : "Low profitability quality",
    summary: `Return ${totalReturnPct.toFixed(2)}% | Drawdown ${maxDrawdownPct.toFixed(2)}% | Win Rate ${winRatePct.toFixed(2)}% | Profit Factor ${profitFactor.toFixed(2)}`,
    insights,
    nextActions
  };
}

export function BacktestPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [resultsTab, setResultsTab] = useState<ResultsTab>("overview");
  const [displayResult, setDisplayResult] = useState<BacktestResponse | null>(null);
  const [autoCandidates, setAutoCandidates] = useState<AutoSimulationCandidate[]>([]);
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<MarketWatchItem | null>(null);
  const [symbol, setSymbol] = useState("JKH.N0000");
  const [range, setRange] = useState<StockHistoryResponse["range"]>("6M");
  const [capital, setCapital] = useState(1_000_000);
  const [strategy, setStrategy] = useState<Strategy>("SMA_CROSSOVER");
  const [fastPeriod, setFastPeriod] = useState(10);
  const [slowPeriod, setSlowPeriod] = useState(30);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOversold, setRsiOversold] = useState(30);
  const [rsiOverbought, setRsiOverbought] = useState(70);

  const [feeMode, setFeeMode] = useState<FeeMode>("BOTH");
  const [buyFeeRatePct, setBuyFeeRatePct] = useState(1.12);
  const [sellFeeRatePct, setSellFeeRatePct] = useState(1.12);
  const [slippageBps, setSlippageBps] = useState(0);
  const [positionSizePct, setPositionSizePct] = useState(100);

  const companyLookupQuery = useQuery({
    queryKey: ["market", "watch", "lookup", "backtest", companySearch],
    queryFn: () =>
      fetchMarketWatch({
        q: companySearch.trim() || undefined,
        sortBy: "name",
        sortDir: "asc",
        limit: 20,
        offset: 0
      }),
    staleTime: 30_000
  });

  const historyQuery = useQuery({
    queryKey: ["stock", "history", "backtest", symbol, range],
    queryFn: () => fetchStockHistory(symbol, range),
    enabled: Boolean(symbol),
    staleTime: 30_000
  });

  const candles = useMemo(() => {
    const items = historyQuery.data?.items ?? [];
    return items
      .filter((item): item is { time: string; close: number } => typeof item.close === "number" && Number.isFinite(item.close))
      .map((item) => ({ time: item.time, close: item.close }));
  }, [historyQuery.data]);

  const validationError = useMemo(() => {
    if (!symbol.trim()) return "Select a company or enter a valid symbol.";
    if (historyQuery.isFetching) return "Loading historical prices...";
    if (candles.length < 20) return "Not enough historical data for this range. Try 1Y/5Y or sync more history.";
    if (strategy === "SMA_CROSSOVER" && fastPeriod >= slowPeriod) return "Fast SMA must be less than Slow SMA.";
    if (capital <= 0) return "Initial capital must be greater than 0.";
    return null;
  }, [candles.length, capital, fastPeriod, historyQuery.isFetching, slowPeriod, strategy, symbol]);

  const strategyLabel =
    strategy === "SMA_CROSSOVER"
      ? `${symbol} • SMA ${fastPeriod}/${slowPeriod} • ${range}`
      : `${symbol} • RSI ${rsiPeriod} (${rsiOversold}/${rsiOverbought}) • ${range}`;

  function applyResearchPreset(preset: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE") {
    if (preset === "CONSERVATIVE") {
      setFeeMode("BOTH");
      setBuyFeeRatePct(1.12);
      setSellFeeRatePct(1.12);
      setSlippageBps(10);
      setPositionSizePct(50);
      setFastPeriod(12);
      setSlowPeriod(48);
      setRsiPeriod(14);
      setRsiOversold(30);
      setRsiOverbought(70);
    } else if (preset === "BALANCED") {
      setFeeMode("BOTH");
      setBuyFeeRatePct(1.12);
      setSellFeeRatePct(1.12);
      setSlippageBps(5);
      setPositionSizePct(80);
      setFastPeriod(10);
      setSlowPeriod(30);
      setRsiPeriod(14);
      setRsiOversold(30);
      setRsiOverbought(70);
    } else {
      setFeeMode("SELL_ONLY");
      setBuyFeeRatePct(1.12);
      setSellFeeRatePct(1.12);
      setSlippageBps(15);
      setPositionSizePct(100);
      setFastPeriod(6);
      setSlowPeriod(18);
      setRsiPeriod(10);
      setRsiOversold(25);
      setRsiOverbought(75);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!symbol.trim()) throw new Error("Symbol is required");
      if (candles.length < 20) throw new Error("Not enough historical data loaded for this range");
      if (strategy === "SMA_CROSSOVER" && fastPeriod >= slowPeriod) throw new Error("Fast SMA must be less than Slow SMA");

      return runBacktest({
        stock_symbol: symbol.trim(),
        initial_capital: capital,
        strategy,
        fast_period: fastPeriod,
        slow_period: slowPeriod,
        rsi_period: rsiPeriod,
        rsi_oversold: rsiOversold,
        rsi_overbought: rsiOverbought,
        position_size_pct: Math.max(5, Math.min(100, positionSizePct)) / 100,
        slippage_bps: Math.max(0, slippageBps),
        fee_mode: feeMode,
        buy_fee_rate_pct: Math.max(0, buyFeeRatePct),
        sell_fee_rate_pct: Math.max(0, sellFeeRatePct),
        candles
      });
    },
    onSuccess: (data) => {
      setDisplayResult(data);
      setAutoCandidates([]);
      setResultsTab("overview");
    }
  });

  const autoSimulationMutation = useMutation({
    mutationFn: async () => {
      if (!symbol.trim()) throw new Error("Symbol is required");
      if (candles.length < 20) throw new Error("Not enough historical data loaded for this range");

      const smaCombos = [
        { fast: 5, slow: 20 },
        { fast: 8, slow: 24 },
        { fast: 10, slow: 30 },
        { fast: 12, slow: 36 },
        { fast: 15, slow: 45 },
        { fast: 20, slow: 60 }
      ];
      const rsiCombos = [
        { period: 10, oversold: 25, overbought: 75 },
        { period: 12, oversold: 30, overbought: 70 },
        { period: 14, oversold: 30, overbought: 70 },
        { period: 14, oversold: 25, overbought: 75 },
        { period: 18, oversold: 20, overbought: 80 }
      ];

      const candidates: AutoSimulationCandidate[] = [];
      const total = smaCombos.length + rsiCombos.length;
      let current = 0;

      for (const combo of smaCombos) {
        current += 1;
        setAutoProgress({ current, total, label: `Testing SMA ${combo.fast}/${combo.slow}` });
        const result = await runBacktest({
          stock_symbol: symbol.trim(),
          initial_capital: capital,
          strategy: "SMA_CROSSOVER",
          fast_period: combo.fast,
          slow_period: combo.slow,
          rsi_period: rsiPeriod,
          rsi_oversold: rsiOversold,
          rsi_overbought: rsiOverbought,
          position_size_pct: Math.max(5, Math.min(100, positionSizePct)) / 100,
          slippage_bps: Math.max(0, slippageBps),
          fee_mode: feeMode,
          buy_fee_rate_pct: Math.max(0, buyFeeRatePct),
          sell_fee_rate_pct: Math.max(0, sellFeeRatePct),
          candles
        });

        candidates.push({
          strategy: "SMA_CROSSOVER",
          label: `SMA ${combo.fast}/${combo.slow}`,
          score: calculateProfitabilityScore(result),
          result,
          fastPeriod: combo.fast,
          slowPeriod: combo.slow
        });
      }

      for (const combo of rsiCombos) {
        current += 1;
        setAutoProgress({ current, total, label: `Testing RSI ${combo.period} (${combo.oversold}/${combo.overbought})` });
        const result = await runBacktest({
          stock_symbol: symbol.trim(),
          initial_capital: capital,
          strategy: "RSI_REVERSION",
          fast_period: fastPeriod,
          slow_period: slowPeriod,
          rsi_period: combo.period,
          rsi_oversold: combo.oversold,
          rsi_overbought: combo.overbought,
          position_size_pct: Math.max(5, Math.min(100, positionSizePct)) / 100,
          slippage_bps: Math.max(0, slippageBps),
          fee_mode: feeMode,
          buy_fee_rate_pct: Math.max(0, buyFeeRatePct),
          sell_fee_rate_pct: Math.max(0, sellFeeRatePct),
          candles
        });

        candidates.push({
          strategy: "RSI_REVERSION",
          label: `RSI ${combo.period} (${combo.oversold}/${combo.overbought})`,
          score: calculateProfitabilityScore(result),
          result,
          rsiPeriod: combo.period,
          rsiOversold: combo.oversold,
          rsiOverbought: combo.overbought
        });
      }

      candidates.sort((a, b) => b.score - a.score || b.result.metrics.total_return - a.result.metrics.total_return);
      if (!candidates.length) throw new Error("Auto Simulation could not find any valid result");
      return candidates;
    },
    onSuccess: (candidates) => {
      const best = candidates[0];
      setAutoProgress(null);
      setAutoCandidates(candidates.slice(0, 5));
      setDisplayResult(best.result);
      setStrategy(best.strategy);
      if (best.strategy === "SMA_CROSSOVER") {
        setFastPeriod(best.fastPeriod ?? fastPeriod);
        setSlowPeriod(best.slowPeriod ?? slowPeriod);
      } else {
        setRsiPeriod(best.rsiPeriod ?? rsiPeriod);
        setRsiOversold(best.rsiOversold ?? rsiOversold);
        setRsiOverbought(best.rsiOverbought ?? rsiOverbought);
      }
      setResultsTab("overview");
      setActiveStep(3);
    },
    onError: () => {
      setAutoProgress(null);
    }
  });

  const profitabilityInsights = useMemo(() => {
    if (!displayResult) return null;
    return buildProfitabilityInsights({
      result: displayResult,
      strategy,
      feeMode,
      fastPeriod,
      slowPeriod,
      rsiPeriod,
      rsiOversold,
      rsiOverbought,
      positionSizePct,
      slippageBps
    });
  }, [displayResult, fastPeriod, feeMode, positionSizePct, rsiOverbought, rsiOversold, rsiPeriod, slippageBps, slowPeriod, strategy]);

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
                Simulate strategy performance with real stored historical prices, including fees, slippage, and position sizing.
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
        <Grid item xs={12} lg={5}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
                <Box>
                  <Typography variant="h6">Simulation Builder</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Guided setup with presets, then run and inspect results.
                  </Typography>
                </Box>
                <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end">
                  <Chip label="Conservative" clickable onClick={() => applyResearchPreset("CONSERVATIVE")} variant="outlined" />
                  <Chip label="Balanced" clickable onClick={() => applyResearchPreset("BALANCED")} color="primary" variant="outlined" />
                  <Chip label="Aggressive" clickable onClick={() => applyResearchPreset("AGGRESSIVE")} variant="outlined" />
                </Stack>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }}>
                {["Market", "Strategy", "Execution", "Review"].map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>

              <Stack gap={2}>
                {activeStep === 0 && (
                  <Stack gap={2}>
                    <Autocomplete
                      options={companyLookupQuery.data?.items ?? []}
                      value={selectedCompany}
                      inputValue={companySearch}
                      onInputChange={(_, value) => setCompanySearch(value)}
                      onChange={(_, value) => {
                        setSelectedCompany(value);
                        if (value) {
                          setSymbol(value.symbol);
                          setCompanySearch(`${value.name} (${value.symbol})`);
                        }
                      }}
                      isOptionEqualToValue={(option, value) => option.symbol === value.symbol}
                      getOptionLabel={(option) => `${option.name} (${option.symbol})`}
                      renderInput={(params) => <TextField {...params} label="Company" helperText="Search by name and pick a symbol" />}
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                      <TextField
                        label="Symbol"
                        value={symbol}
                        onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                        fullWidth
                      />
                      <TextField
                        select
                        label="Range"
                        value={range}
                        onChange={(e) => setRange(e.target.value as StockHistoryResponse["range"])}
                        fullWidth
                      >
                        {(["1M", "3M", "6M", "1Y", "5Y"] as StockHistoryResponse["range"][]).map((r) => (
                          <MenuItem key={r} value={r}>
                            {r}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                          <Typography variant="subtitle2">Dataset Preview</Typography>
                          <Chip
                            label={historyQuery.isFetching ? "Loading..." : `${candles.length} candles`}
                            size="small"
                            variant="outlined"
                          />
                        </Stack>
                        <Box sx={{ width: "100%", height: 140, mt: 2 }}>
                          <ResponsiveContainer>
                            <LineChart data={candles.slice(-90)}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                              <XAxis dataKey="time" hide />
                              <YAxis hide />
                              <Tooltip />
                              <Line type="monotone" dataKey="close" stroke="#7dd3fc" strokeWidth={2.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Uses locally stored history (offline-capable). If you see low candle count, sync more data.
                        </Typography>
                      </CardContent>
                    </Card>
                  </Stack>
                )}

                {activeStep === 1 && (
                  <Stack gap={2}>
                    <ToggleButtonGroup
                      value={strategy}
                      exclusive
                      onChange={(_, value) => {
                        if (!value) return;
                        setStrategy(value as Strategy);
                        if (value === "SMA_CROSSOVER") {
                          setFastPeriod((prev) => (prev ? prev : 10));
                          setSlowPeriod((prev) => (prev ? prev : 30));
                        } else {
                          setRsiPeriod((prev) => (prev ? prev : 14));
                          setRsiOversold((prev) => (prev ? prev : 30));
                          setRsiOverbought((prev) => (prev ? prev : 70));
                        }
                      }}
                      fullWidth
                    >
                      <ToggleButton value="SMA_CROSSOVER">Trend (SMA Crossover)</ToggleButton>
                      <ToggleButton value="RSI_REVERSION">Mean Reversion (RSI)</ToggleButton>
                    </ToggleButtonGroup>

                    {strategy === "SMA_CROSSOVER" && (
                      <Stack gap={2}>
                        <Typography variant="body2" color="text.secondary">
                          Buys when fast moving average crosses above slow average. Sells on cross down.
                        </Typography>
                        <Card variant="outlined">
                          <CardContent>
                            <Stack gap={2}>
                              <Box>
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="subtitle2">Fast SMA</Typography>
                                  <Chip label={`${fastPeriod}`} size="small" variant="outlined" />
                                </Stack>
                                <Slider
                                  value={fastPeriod}
                                  min={2}
                                  max={50}
                                  step={1}
                                  onChange={(_, value) => setFastPeriod(value as number)}
                                />
                              </Box>
                              <Box>
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="subtitle2">Slow SMA</Typography>
                                  <Chip label={`${slowPeriod}`} size="small" variant="outlined" />
                                </Stack>
                                <Slider
                                  value={slowPeriod}
                                  min={5}
                                  max={200}
                                  step={1}
                                  onChange={(_, value) => setSlowPeriod(value as number)}
                                />
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Stack>
                    )}

                    {strategy === "RSI_REVERSION" && (
                      <Stack gap={2}>
                        <Typography variant="body2" color="text.secondary">
                          Buys when RSI enters oversold range and exits when RSI becomes overbought.
                        </Typography>
                        <Card variant="outlined">
                          <CardContent>
                            <Stack gap={2}>
                              <Box>
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="subtitle2">RSI Period</Typography>
                                  <Chip label={`${rsiPeriod}`} size="small" variant="outlined" />
                                </Stack>
                                <Slider value={rsiPeriod} min={5} max={30} step={1} onChange={(_, value) => setRsiPeriod(value as number)} />
                              </Box>
                              <Box>
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="subtitle2">Oversold</Typography>
                                  <Chip label={`${rsiOversold}`} size="small" variant="outlined" />
                                </Stack>
                                <Slider
                                  value={rsiOversold}
                                  min={10}
                                  max={40}
                                  step={1}
                                  onChange={(_, value) => setRsiOversold(value as number)}
                                />
                              </Box>
                              <Box>
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="subtitle2">Overbought</Typography>
                                  <Chip label={`${rsiOverbought}`} size="small" variant="outlined" />
                                </Stack>
                                <Slider
                                  value={rsiOverbought}
                                  min={60}
                                  max={90}
                                  step={1}
                                  onChange={(_, value) => setRsiOverbought(value as number)}
                                />
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Stack>
                    )}
                  </Stack>
                )}

                {activeStep === 2 && (
                  <Stack gap={2}>
                    <TextField
                      label="Initial Capital (LKR)"
                      type="number"
                      value={capital}
                      onChange={(event) => setCapital(Number(event.target.value))}
                      helperText="Starting account balance used for simulation"
                    />
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2">Position & Slippage</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Controls how aggressively the engine enters positions and the execution penalty.
                        </Typography>
                        <Divider sx={{ my: 2 }} />
                        <Stack gap={2}>
                          <Box>
                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="subtitle2">Position Size</Typography>
                              <Chip label={`${positionSizePct}%`} size="small" variant="outlined" />
                            </Stack>
                            <Slider value={positionSizePct} min={10} max={100} step={5} onChange={(_, value) => setPositionSizePct(value as number)} />
                          </Box>
                          <Box>
                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="subtitle2">Slippage</Typography>
                              <Chip label={`${slippageBps} bps`} size="small" variant="outlined" />
                            </Stack>
                            <Slider value={slippageBps} min={0} max={50} step={1} onChange={(_, value) => setSlippageBps(value as number)} />
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>

                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                          <Typography variant="subtitle2">Costs & Commissions</Typography>
                          <Chip label="Default 1.12%" size="small" variant="outlined" />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Choose a fee model. If your broker charges only one side for intraday, use “Sell Only”.
                        </Typography>
                        <Divider sx={{ my: 2 }} />
                        <ToggleButtonGroup
                          value={feeMode}
                          exclusive
                          onChange={(_, value) => {
                            if (value) setFeeMode(value as FeeMode);
                          }}
                          fullWidth
                        >
                          <ToggleButton value="BOTH">Buy + Sell</ToggleButton>
                          <ToggleButton value="SELL_ONLY">Sell Only</ToggleButton>
                          <ToggleButton value="BUY_ONLY">Buy Only</ToggleButton>
                          <ToggleButton value="NONE">No Fees</ToggleButton>
                        </ToggleButtonGroup>
                        <Stack gap={2} sx={{ mt: 2 }}>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="subtitle2">Buy Fee</Typography>
                            <Chip label={`${buyFeeRatePct.toFixed(2)}%`} size="small" variant="outlined" />
                          </Stack>
                          <Slider
                            value={buyFeeRatePct}
                            min={0}
                            max={2.5}
                            step={0.01}
                            onChange={(_, value) => setBuyFeeRatePct(value as number)}
                            disabled={feeMode === "NONE" || feeMode === "SELL_ONLY"}
                          />
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="subtitle2">Sell Fee</Typography>
                            <Chip label={`${sellFeeRatePct.toFixed(2)}%`} size="small" variant="outlined" />
                          </Stack>
                          <Slider
                            value={sellFeeRatePct}
                            min={0}
                            max={2.5}
                            step={0.01}
                            onChange={(_, value) => setSellFeeRatePct(value as number)}
                            disabled={feeMode === "NONE" || feeMode === "BUY_ONLY"}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  </Stack>
                )}

                {activeStep === 3 && (
                  <Stack gap={2}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2">Run Summary</Typography>
                        <Divider sx={{ my: 2 }} />
                        <Stack direction="row" flexWrap="wrap" gap={1}>
                          <Chip label={strategyLabel} variant="outlined" />
                          <Chip label={`Capital LKR ${capital.toLocaleString()}`} variant="outlined" />
                          <Chip label={`Position ${positionSizePct}%`} variant="outlined" />
                          <Chip label={`Fees ${feeMode}`} variant="outlined" />
                          <Chip label={`Slippage ${slippageBps} bps`} variant="outlined" />
                          <Chip label={`${candles.length} candles`} variant="outlined" />
                        </Stack>
                      </CardContent>
                    </Card>

                    {validationError && <Alert severity="warning">{validationError}</Alert>}
                    {mutation.error && (
                      <Alert severity="error">
                        {(mutation.error as Error).message}
                      </Alert>
                    )}
                    {autoSimulationMutation.error && (
                      <Alert severity="error">
                        {(autoSimulationMutation.error as Error).message}
                      </Alert>
                    )}

                    <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
                      <Button
                        variant="contained"
                        size="large"
                        onClick={() => mutation.mutate()}
                        disabled={Boolean(validationError) || mutation.isPending || autoSimulationMutation.isPending}
                        sx={{ height: 54, borderRadius: 4, flex: 1 }}
                      >
                        {mutation.isPending ? "Running Simulation..." : "Run Simulation"}
                      </Button>
                      <Button
                        variant="outlined"
                        size="large"
                        onClick={() => autoSimulationMutation.mutate()}
                        disabled={Boolean(validationError) || mutation.isPending || autoSimulationMutation.isPending}
                        sx={{ height: 54, borderRadius: 4, flex: 1 }}
                      >
                        {autoSimulationMutation.isPending ? "Auto Simulating..." : "Auto Simulation"}
                      </Button>
                    </Stack>

                    {mutation.isPending && (
                      <Box>
                        <LinearProgress sx={{ height: 10, borderRadius: 999 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Executing strategy rules and computing performance metrics...
                        </Typography>
                      </Box>
                    )}
                    {autoSimulationMutation.isPending && autoProgress && (
                      <Box>
                        <LinearProgress
                          variant="determinate"
                          value={(autoProgress.current / autoProgress.total) * 100}
                          sx={{ height: 10, borderRadius: 999 }}
                        />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {autoProgress.label} ({autoProgress.current}/{autoProgress.total})
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                )}

                <Stack direction="row" justifyContent="space-between" sx={{ pt: 1 }}>
                  <Button
                    variant="text"
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={activeStep === 3}
                    onClick={() => setActiveStep((prev) => Math.min(3, prev + 1))}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={7}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                <Box>
                  <Typography variant="h6">Performance Overview</Typography>
                  <Typography variant="body2" color="text.secondary">
                    High-level research output for the selected signal profile.
                  </Typography>
                </Box>
                <Chip label={strategyLabel} variant="outlined" />
              </Stack>
              {!displayResult && (
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
                    Complete the guided setup and run a simulation to view returns, drawdown, fees, equity curve, and trade details.
                  </Typography>
                </Box>
              )}
              {displayResult && (
                <Stack gap={2.5} sx={{ mt: 3 }}>
                  <Tabs
                    value={resultsTab}
                    onChange={(_, value) => setResultsTab(value)}
                    sx={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <Tab value="overview" label="Overview" />
                    <Tab value="equity" label="Equity Curve" />
                    <Tab value="trades" label="Trades" />
                  </Tabs>

                  {resultsTab === "overview" && (
                    <Stack gap={2}>
                      {profitabilityInsights && (
                        <Card
                          sx={{
                            background:
                              profitabilityInsights.tone === "success"
                                ? "linear-gradient(135deg, rgba(20,83,45,0.45), rgba(6,18,32,0.98))"
                                : profitabilityInsights.tone === "info"
                                  ? "linear-gradient(135deg, rgba(30,64,175,0.35), rgba(6,18,32,0.98))"
                                  : profitabilityInsights.tone === "warning"
                                    ? "linear-gradient(135deg, rgba(133,77,14,0.35), rgba(6,18,32,0.98))"
                                    : "linear-gradient(135deg, rgba(127,29,29,0.35), rgba(6,18,32,0.98))"
                          }}
                        >
                          <CardContent>
                            <Stack direction={{ xs: "column", lg: "row" }} gap={2} justifyContent="space-between">
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="overline" color="text.secondary">
                                  Profitability Guidance
                                </Typography>
                                <Typography variant="h5">{profitabilityInsights.headline}</Typography>
                                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                                  {profitabilityInsights.summary}
                                </Typography>
                              </Box>
                              <Box sx={{ minWidth: { xs: "100%", lg: 240 } }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                  <Typography variant="subtitle2">Profitability Score</Typography>
                                  <Chip label={`${profitabilityInsights.score}/100`} color={profitabilityInsights.tone} />
                                </Stack>
                                <LinearProgress
                                  variant="determinate"
                                  value={profitabilityInsights.score}
                                  color={profitabilityInsights.tone}
                                  sx={{ height: 12, borderRadius: 999 }}
                                />
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      )}

                      <Grid container spacing={2}>
                        {[
                          ["Total Return", `${(displayResult.metrics.total_return * 100).toFixed(2)}%`],
                          ["Win Rate", `${(displayResult.metrics.win_rate * 100).toFixed(2)}%`],
                          ["Profit Factor", displayResult.metrics.profit_factor.toFixed(2)],
                          ["Max Drawdown", `${(displayResult.metrics.max_drawdown * 100).toFixed(2)}%`],
                          ["Sharpe Ratio", displayResult.metrics.sharpe_ratio.toFixed(2)],
                          [
                            "Total Fees",
                            typeof displayResult.metrics.total_fees === "number"
                              ? displayResult.metrics.total_fees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "—"
                          ],
                          ["Trades", `${displayResult.metrics.trade_count ?? displayResult.trades.length}`]
                        ].map(([label, value]) => (
                          <Grid item xs={12} sm={6} xl={4} key={label}>
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

                      {profitabilityInsights && (
                        <Grid container spacing={2}>
                          <Grid item xs={12} xl={7}>
                            <Card>
                              <CardContent>
                                <Typography variant="subtitle1">Smart Recommendations</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Statistical reading of this run with actionable tuning hints.
                                </Typography>
                                <Divider sx={{ my: 2 }} />
                                <Stack gap={1.5}>
                                  {profitabilityInsights.insights.map((item, index) => (
                                    <Alert key={`${item.title}-${index}`} severity={item.severity}>
                                      <Typography variant="subtitle2">{item.title}</Typography>
                                      <Typography variant="body2">{item.description}</Typography>
                                    </Alert>
                                  ))}
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>
                          <Grid item xs={12} xl={5}>
                            <Card sx={{ height: "100%" }}>
                              <CardContent>
                                <Typography variant="subtitle1">Next Best Actions</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Recommended next experiments to improve profitability quality.
                                </Typography>
                                <Divider sx={{ my: 2 }} />
                                <Stack gap={1.25}>
                                  {profitabilityInsights.nextActions.map((action, index) => (
                                    <Card
                                      key={`${action}-${index}`}
                                      variant="outlined"
                                      sx={{ background: "rgba(255,255,255,0.02)" }}
                                    >
                                      <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                                        <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                          <Chip label={index + 1} size="small" color={profitabilityInsights.tone} />
                                          <Typography variant="body2">{action}</Typography>
                                        </Stack>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>
                        </Grid>
                      )}

                      {autoCandidates.length > 0 && (
                        <Card>
                          <CardContent>
                            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
                              <Box>
                                <Typography variant="subtitle1">Auto Simulation Best Matches</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Top parameter sets discovered automatically for this company and date range.
                                </Typography>
                              </Box>
                              <Chip label={`${autoCandidates.length} ranked setups`} variant="outlined" />
                            </Stack>
                            <Divider sx={{ my: 2 }} />
                            <Stack gap={1.25}>
                              {autoCandidates.map((candidate, index) => (
                                <Card key={`${candidate.label}-${index}`} variant="outlined" sx={{ background: "rgba(255,255,255,0.02)" }}>
                                  <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}>
                                      <Box>
                                        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                                          <Chip label={`#${index + 1}`} size="small" color={index === 0 ? "success" : "default"} />
                                          <Typography variant="subtitle2">{candidate.label}</Typography>
                                          <Chip label={`Score ${candidate.score}`} size="small" color={getScoreTone(candidate.score)} />
                                        </Stack>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                                          Return {(candidate.result.metrics.total_return * 100).toFixed(2)}% | Drawdown {(candidate.result.metrics.max_drawdown * 100).toFixed(2)}% | Trades {candidate.result.metrics.trade_count ?? candidate.result.trades.length}
                                        </Typography>
                                      </Box>
                                      <Button
                                        variant="outlined"
                                        onClick={() => {
                                          setDisplayResult(candidate.result);
                                          setStrategy(candidate.strategy);
                                          if (candidate.strategy === "SMA_CROSSOVER") {
                                            setFastPeriod(candidate.fastPeriod ?? fastPeriod);
                                            setSlowPeriod(candidate.slowPeriod ?? slowPeriod);
                                          } else {
                                            setRsiPeriod(candidate.rsiPeriod ?? rsiPeriod);
                                            setRsiOversold(candidate.rsiOversold ?? rsiOversold);
                                            setRsiOverbought(candidate.rsiOverbought ?? rsiOverbought);
                                          }
                                          setResultsTab("overview");
                                        }}
                                      >
                                        Apply This Setup
                                      </Button>
                                    </Stack>
                                  </CardContent>
                                </Card>
                              ))}
                            </Stack>
                          </CardContent>
                        </Card>
                      )}
                    </Stack>
                  )}

                  {resultsTab === "equity" && (
                    <Card>
                      <CardContent>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
                          <Box>
                            <Typography variant="subtitle1">Equity Curve</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Fee-aware portfolio value through time.
                            </Typography>
                          </Box>
                          <Stack direction="row" gap={1} flexWrap="wrap">
                            <Button
                              variant="outlined"
                              onClick={() => downloadText(`equity_${symbol}_${range}.csv`, toCsv(displayResult!.equity_curve))}
                            >
                              Export Equity CSV
                            </Button>
                            <Button
                              variant="outlined"
                              onClick={() => downloadText(`trades_${symbol}_${range}.csv`, toCsv(displayResult!.trades))}
                            >
                              Export Trades CSV
                            </Button>
                          </Stack>
                        </Stack>
                        <Box sx={{ width: "100%", height: 360, mt: 2 }}>
                          <ResponsiveContainer>
                            <LineChart data={displayResult.equity_curve}>
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
                  )}

                  {resultsTab === "trades" && (
                    <Card>
                      <CardContent>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
                          <Box>
                            <Typography variant="subtitle1">Trades</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Executions with fee-adjusted P/L.
                            </Typography>
                          </Box>
                          <Chip label={`${displayResult.trades.length} trades`} variant="outlined" />
                        </Stack>
                        <Box sx={{ mt: 2 }}>
                          <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Entry</TableCell>
                                  <TableCell>Exit</TableCell>
                                  <TableCell align="right">Entry Price</TableCell>
                                  <TableCell align="right">Exit Price</TableCell>
                                  <TableCell align="right">Shares</TableCell>
                                  <TableCell align="right">Fees</TableCell>
                                  <TableCell align="right">P/L</TableCell>
                                  <TableCell align="right">Return %</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {displayResult.trades.map((trade, index) => {
                                  const fees = (trade.entry_fees ?? 0) + (trade.exit_fees ?? 0);
                                  const pnl = trade.pnl;
                                  return (
                                    <TableRow key={`${trade.entry_time}-${trade.exit_time}-${index}`}>
                                      <TableCell>{trade.entry_time}</TableCell>
                                      <TableCell>{trade.exit_time}</TableCell>
                                      <TableCell align="right">{trade.entry_price.toFixed(2)}</TableCell>
                                      <TableCell align="right">{trade.exit_price.toFixed(2)}</TableCell>
                                      <TableCell align="right">{Number(trade.shares).toFixed(2)}</TableCell>
                                      <TableCell align="right">{fees.toFixed(2)}</TableCell>
                                      <TableCell
                                        align="right"
                                        sx={{ color: pnl >= 0 ? "success.main" : "error.main", fontWeight: 700 }}
                                      >
                                        {pnl.toFixed(2)}
                                      </TableCell>
                                      <TableCell align="right">{(trade.return_pct * 100).toFixed(2)}%</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      </CardContent>
                    </Card>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
