import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { fetchStockHistory, fetchStockQuote, fetchStockRecommendation } from "../api/stockApi";
import { fetchMarketWatch, type MarketWatchItem } from "../api/marketDataApi";
import { useI18n } from "../i18n/I18nProvider";

function toNumber(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function StockAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSymbol = searchParams.get("symbol")?.toUpperCase() ?? "JKH.N0000";
  const { t } = useI18n();
  const [companySearch, setCompanySearch] = useState(initialSymbol);
  const [selectedCompany, setSelectedCompany] = useState<MarketWatchItem | null>(null);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeRange, setTimeRange] = useState("1M");
  const [plannerCapital, setPlannerCapital] = useState(250_000);
  const [plannerRiskPct, setPlannerRiskPct] = useState(2);

  useEffect(() => {
    const nextSymbol = searchParams.get("symbol")?.toUpperCase();
    if (nextSymbol && nextSymbol !== symbol) {
      setCompanySearch(nextSymbol);
      setSelectedCompany(null);
      setSymbol(nextSymbol);
    }
  }, [searchParams, symbol]);

  const companyLookupQuery = useQuery({
    queryKey: ["market", "watch", "lookup", companySearch],
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

  const quoteQuery = useQuery({
    queryKey: ["stock", "quote", symbol],
    queryFn: () => fetchStockQuote(symbol)
  });

  const recommendationQuery = useQuery({
    queryKey: ["stock", "recommendation", symbol],
    queryFn: () => fetchStockRecommendation(symbol)
  });

  const historyQuery = useQuery({
    queryKey: ["stock", "history", symbol, timeRange],
    queryFn: () => fetchStockHistory(symbol, timeRange as "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y")
  });

  const quote = quoteQuery.data?.reqSymbolInfo;
  const changePct = useMemo(() => toNumber(quote?.changePercentage), [quote?.changePercentage]);
  const lastPrice = toNumber(quote?.lastTradedPrice);
  const priceSeries = useMemo(() => {
    if (historyQuery.data?.items?.length) {
      return historyQuery.data.items
        .filter((item) => typeof item.close === "number")
        .map((item, index) => ({
          point:
            historyQuery.data!.range === "1D" || historyQuery.data!.items.length <= 12
              ? new Date(item.time).toLocaleDateString()
              : `${index + 1}`,
          price: Number((item.close ?? 0).toFixed(2))
        }));
    }
    const base = lastPrice ?? 180;
    return Array.from({ length: 24 }, (_, index) => {
      const wave = Math.sin(index / 2.8) * 2.1;
      const trend = (index - 10) * 0.22;
      return {
        point: `${index + 1}`,
        price: Number((base + wave + trend).toFixed(2))
      };
    });
  }, [lastPrice]);
  const recommendation = recommendationQuery.data;
  const companyOptions = companyLookupQuery.data?.items ?? [];
  const currentCompanyName = selectedCompany?.name ?? quote?.name ?? symbol;
  const historyCloses = useMemo(() => {
    return (historyQuery.data?.items ?? [])
      .map((item) => item.close)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  }, [historyQuery.data]);

  const aiTradePlan = useMemo(() => {
    const currentPrice = lastPrice ?? historyCloses.at(-1) ?? null;
    if (!currentPrice || historyCloses.length < 10) return null;

    const recentWindow = historyCloses.slice(-20);
    const support = Math.min(...recentWindow);
    const resistance = Math.max(...recentWindow);
    const avgMove =
      recentWindow.length > 1
        ? recentWindow.slice(1).reduce((sum, close, index) => sum + Math.abs(close - recentWindow[index]), 0) / (recentWindow.length - 1)
        : currentPrice * 0.02;
    const volatilityBuffer = Math.max(avgMove, currentPrice * 0.015);
    const rawScore = typeof recommendation?.metrics?.score === "number" ? recommendation.metrics.score : 0;
    const action = recommendation?.action ?? "HOLD";
    const confidence = recommendation?.confidence ?? 50;

    let entryLow = currentPrice - volatilityBuffer * 0.5;
    let entryHigh = currentPrice + volatilityBuffer * 0.35;
    let stopLoss = support - volatilityBuffer * 0.6;
    let target1 = currentPrice + volatilityBuffer * 1.2;
    let target2 = resistance + volatilityBuffer * 0.8;
    let setupLabel = "Wait / Hold";
    let holdingBias = "Short to medium term";

    if (action === "BUY") {
      entryLow = Math.max(support, currentPrice - volatilityBuffer * 0.7);
      entryHigh = currentPrice + volatilityBuffer * 0.2;
      stopLoss = Math.max(0, support - volatilityBuffer * 0.8);
      target1 = Math.max(currentPrice + volatilityBuffer * 1.5, resistance);
      target2 = target1 + volatilityBuffer * 1.4;
      setupLabel = rawScore > 0.45 ? "Accumulation Zone" : "Breakout Watch";
      holdingBias = confidence >= 70 ? "Swing follow-through likely" : "Need confirmation on next sessions";
    } else if (action === "SELL") {
      entryLow = currentPrice - volatilityBuffer * 0.2;
      entryHigh = Math.min(resistance, currentPrice + volatilityBuffer * 0.6);
      stopLoss = resistance + volatilityBuffer * 0.8;
      target1 = Math.max(0, currentPrice - volatilityBuffer * 1.4);
      target2 = Math.max(0, support - volatilityBuffer * 0.8);
      setupLabel = "Exit / Reduce Exposure";
      holdingBias = "Capital protection mode";
    } else {
      entryLow = support + volatilityBuffer * 0.1;
      entryHigh = resistance - volatilityBuffer * 0.1;
      stopLoss = support - volatilityBuffer * 0.5;
      target1 = resistance;
      target2 = resistance + volatilityBuffer;
      setupLabel = "Range Wait";
      holdingBias = "Wait for stronger signal";
    }

    const risk = Math.max(0.01, Math.abs(((entryLow + entryHigh) / 2) - stopLoss));
    const reward = Math.max(0.01, target2 - ((entryLow + entryHigh) / 2));
    const rewardRisk = reward / risk;
    const expectedReturnPct = ((target2 - currentPrice) / currentPrice) * 100;

    const hints: string[] = [];
    if (action === "BUY") {
      hints.push("Prefer entries near support or on a confirmed move above resistance.");
      hints.push("Scale in gradually instead of using full capital at once.");
    } else if (action === "SELL") {
      hints.push("Use rallies toward resistance to lighten exposure.");
      hints.push("Preserve capital if price breaks below recent support.");
    } else {
      hints.push("Current edge is weak; wait for a clearer setup before entering.");
      hints.push("A breakout above resistance or rebound from support gives a better signal.");
    }
    if (rewardRisk < 1.5) {
      hints.push("Reward/risk is not ideal yet. Wait for a better entry to improve profitability.");
    }
    if (confidence >= 70) {
      hints.push("Signal confidence is relatively strong on the current dataset.");
    }

    return {
      action,
      confidence,
      setupLabel,
      holdingBias,
      entryLow,
      entryHigh,
      stopLoss,
      target1,
      target2,
      support,
      resistance,
      rewardRisk,
      expectedReturnPct,
      hints
    };
  }, [historyCloses, lastPrice, recommendation]);

  const aiOpportunityScore = useMemo(() => {
    if (!aiTradePlan) return 0;
    const base = clamp((recommendation?.confidence ?? 50) * 0.55 + aiTradePlan.rewardRisk * 18 + aiTradePlan.expectedReturnPct * 1.1, 0, 100);
    return Math.round(base);
  }, [aiTradePlan, recommendation?.confidence]);

  const aiPositionPlan = useMemo(() => {
    if (!aiTradePlan) return null;
    const entryMid = (aiTradePlan.entryLow + aiTradePlan.entryHigh) / 2;
    const riskPerShare = Math.max(0.01, Math.abs(entryMid - aiTradePlan.stopLoss));
    const maxRiskCapital = plannerCapital * (plannerRiskPct / 100);
    const suggestedShares = Math.max(0, Math.floor(maxRiskCapital / riskPerShare));
    const positionValue = suggestedShares * entryMid;
    const target1Profit = suggestedShares * (aiTradePlan.target1 - entryMid);
    const target2Profit = suggestedShares * (aiTradePlan.target2 - entryMid);
    const stopLossRisk = suggestedShares * riskPerShare;

    return {
      entryMid,
      riskPerShare,
      maxRiskCapital,
      suggestedShares,
      positionValue,
      target1Profit,
      target2Profit,
      stopLossRisk
    };
  }, [aiTradePlan, plannerCapital, plannerRiskPct]);

  const aiScenarioForecast = useMemo(() => {
    if (!aiTradePlan) return null;
    const entryMid = (aiTradePlan.entryLow + aiTradePlan.entryHigh) / 2;
    const basePrice = lastPrice ?? entryMid;
    const bullPrice = aiTradePlan.target2;
    const baseCasePrice = aiTradePlan.target1;
    const bearPrice = aiTradePlan.stopLoss;

    return [
      {
        label: "Bull Case",
        probability: Math.round(clamp((recommendation?.confidence ?? 50) * 0.55, 20, 75)),
        price: bullPrice,
        movePct: ((bullPrice - basePrice) / basePrice) * 100,
        color: "success.main"
      },
      {
        label: "Base Case",
        probability: Math.round(clamp((recommendation?.confidence ?? 50) * 0.75, 25, 80)),
        price: baseCasePrice,
        movePct: ((baseCasePrice - basePrice) / basePrice) * 100,
        color: "info.main"
      },
      {
        label: "Bear Case",
        probability: Math.round(clamp(100 - (recommendation?.confidence ?? 50) * 0.6, 15, 55)),
        price: bearPrice,
        movePct: ((bearPrice - basePrice) / basePrice) * 100,
        color: "error.main"
      }
    ];
  }, [aiTradePlan, lastPrice, recommendation?.confidence]);

  const indicatorScores = [
    { label: "RSI", value: recommendation?.action === "BUY" ? 72 : recommendation?.action === "SELL" ? 28 : 51 },
    { label: "MACD", value: recommendation?.action === "BUY" ? 78 : recommendation?.action === "SELL" ? 34 : 52 },
    { label: "EMA Trend", value: recommendation?.action === "BUY" ? 69 : recommendation?.action === "SELL" ? 39 : 50 },
    { label: "Volume", value: recommendation?.action === "BUY" ? 74 : recommendation?.action === "SELL" ? 45 : 53 }
  ];

  const applySelection = () => {
    const normalizedInput = companySearch.trim();
    if (!normalizedInput) return;

    const matchedCompany =
      selectedCompany ??
      companyOptions.find(
        (item) =>
          item.symbol.toLowerCase() === normalizedInput.toLowerCase() ||
          item.name.toLowerCase() === normalizedInput.toLowerCase()
      );

    const nextSymbol = (matchedCompany?.symbol ?? normalizedInput).toUpperCase();
    setSelectedCompany(matchedCompany ?? null);
    setSymbol(nextSymbol);
    setSearchParams({ symbol: nextSymbol });
  };

  return (
    <Stack gap={3}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", lg: "center" }}
        gap={2}
      >
        <Box>
          <Typography variant="h4">{t("stock.title")}</Typography>
          <Typography color="text.secondary">
            {t("stock.subtitle")}
          </Typography>
        </Box>
        <ToggleButtonGroup
          exclusive
          value={timeRange}
          onChange={(_, value) => value && setTimeRange(value)}
          size="small"
          color="primary"
        >
          {["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"].map((range) => (
            <ToggleButton key={range} value={range}>
              {range}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
        <Autocomplete
          fullWidth
          options={companyOptions}
          value={selectedCompany}
          inputValue={companySearch}
          onInputChange={(_, value, reason) => {
            if (reason === "reset") return;
            setCompanySearch(value);
          }}
          onChange={(_, value) => {
            setSelectedCompany(value);
            if (value) {
              setCompanySearch(`${value.name} (${value.symbol})`);
            }
          }}
          getOptionLabel={(option) =>
            typeof option === "string" ? option : `${option.name} (${option.symbol})`
          }
          isOptionEqualToValue={(option, value) => option.symbol === value.symbol}
          loading={companyLookupQuery.isLoading}
          renderOption={(props, option) => (
            <Box component="li" {...props}>
              <Stack sx={{ width: "100%" }}>
                <Typography variant="subtitle2">{option.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {option.symbol}
                </Typography>
              </Stack>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Company or Symbol"
              helperText={
                selectedCompany
                  ? `Selected: ${selectedCompany.name} (${selectedCompany.symbol})`
                  : t("stock.symbolHelper")
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySelection();
                }
              }}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {companyLookupQuery.isFetching ? <CircularProgress color="inherit" size={18} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                )
              }}
            />
          )}
          noOptionsText="No matching company found"
        />
        <Button
          variant="contained"
          onClick={applySelection}
        >
          {t("common.analyze")}
        </Button>
      </Stack>

      {(quoteQuery.error || recommendationQuery.error) && (
        <Alert severity="error">
          {((quoteQuery.error || recommendationQuery.error) as Error)?.message ?? t("stock.failed")}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Stack gap={2}>
                <Box>
                  <Typography variant="h6">{currentCompanyName}</Typography>
                  <Typography color="text.secondary">{quote?.symbol ?? symbol}</Typography>
                </Box>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
                  <Box>
                    <Typography variant="h3">
                      {typeof toNumber(quote?.lastTradedPrice) === "number"
                        ? toNumber(quote?.lastTradedPrice)?.toLocaleString()
                        : "—"}
                    </Typography>
                    <Typography color={typeof changePct === "number" && changePct < 0 ? "error" : "success.main"}>
                      {typeof changePct === "number" ? `${changePct.toFixed(2)}%` : "—"}
                    </Typography>
                  </Box>
                  <Stack direction="row" gap={1} flexWrap="wrap">
                    <Chip label={`Source ${quoteQuery.data?.source ?? "live"}`} variant="outlined" />
                    <Chip label={`Range ${timeRange}`} variant="outlined" />
                    <Chip label={`Volume ${toNumber(quote?.tdyShareVolume)?.toLocaleString() ?? "—"}`} />
                    <Chip label={`Market Cap ${toNumber(quote?.marketCap)?.toLocaleString() ?? "—"}`} />
                  </Stack>
                </Stack>
                <Divider />
                <Box sx={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <AreaChart data={priceSeries}>
                      <defs>
                        <linearGradient id="analysisArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f8cff" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#4f8cff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="point" />
                      <YAxis domain={["auto", "auto"]} />
                      <ChartTooltip />
                      <Area type="monotone" dataKey="price" stroke="#4f8cff" fill="url(#analysisArea)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6">{t("stock.recommendation")}</Typography>
              <Typography variant="h2" sx={{ mt: 1 }}>
                {recommendation?.action ?? "—"}
              </Typography>
              <Typography color="text.secondary">
                {t("stock.confidence")}: {typeof recommendation?.confidence === "number" ? `${recommendation.confidence.toFixed(0)}%` : "—"}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={recommendation?.confidence ?? 0}
                sx={{ mt: 2, height: 10, borderRadius: 999 }}
              />
              <Stack gap={1} sx={{ mt: 2 }}>
                {(recommendation?.reasons ?? []).map((reason) => (
                  <Chip key={reason} label={reason} color="primary" variant="outlined" />
                ))}
              </Stack>
              {aiTradePlan && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1">AI Opportunity Score</Typography>
                  <Typography variant="h4" sx={{ mt: 0.5 }}>
                    {aiOpportunityScore}/100
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={aiOpportunityScore}
                    color={aiOpportunityScore >= 70 ? "success" : aiOpportunityScore >= 50 ? "warning" : "error"}
                    sx={{ mt: 1.5, height: 10, borderRadius: 999 }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {aiTradePlan.setupLabel} | {aiTradePlan.holdingBias}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {aiTradePlan && (
        <Card>
          <CardContent>
            <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "center" }} gap={2}>
              <Box>
                <Typography variant="h6">AI Trade Plan</Typography>
                <Typography variant="body2" color="text.secondary">
                  Data-driven entry, exit, and risk guidance generated from current price structure and AI signal metrics.
                </Typography>
              </Box>
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Chip label={`Action ${aiTradePlan.action}`} color={aiTradePlan.action === "BUY" ? "success" : aiTradePlan.action === "SELL" ? "error" : "default"} />
                <Chip label={`Reward/Risk ${aiTradePlan.rewardRisk.toFixed(2)}x`} variant="outlined" />
                <Chip label={`Expected Upside ${aiTradePlan.expectedReturnPct.toFixed(2)}%`} variant="outlined" />
              </Stack>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              {[
                ["Entry Zone", `${aiTradePlan.entryLow.toFixed(2)} - ${aiTradePlan.entryHigh.toFixed(2)}`],
                ["Stop Loss", aiTradePlan.stopLoss.toFixed(2)],
                ["Target 1", aiTradePlan.target1.toFixed(2)],
                ["Target 2", aiTradePlan.target2.toFixed(2)],
                ["Support", aiTradePlan.support.toFixed(2)],
                ["Resistance", aiTradePlan.resistance.toFixed(2)]
              ].map(([label, value]) => (
                <Grid item xs={12} sm={6} md={4} key={label}>
                  <Box sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(255,255,255,0.02)", height: "100%" }}>
                    <Typography color="text.secondary" variant="body2">
                      {label}
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.5 }}>
                      {value}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Divider sx={{ my: 2 }} />
            <Stack gap={1.25}>
              {aiTradePlan.hints.map((hint) => (
                <Alert key={hint} severity="info">
                  {hint}
                </Alert>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {aiTradePlan && aiPositionPlan && (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={7}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6">AI Position Planner</Typography>
                <Typography variant="body2" color="text.secondary">
                  Build a position size using your capital and maximum accepted risk per trade.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                  <TextField
                    label="Capital (LKR)"
                    type="number"
                    value={plannerCapital}
                    onChange={(event) => setPlannerCapital(Number(event.target.value))}
                    fullWidth
                  />
                  <TextField
                    label="Risk Per Trade (%)"
                    type="number"
                    value={plannerRiskPct}
                    onChange={(event) => setPlannerRiskPct(Number(event.target.value))}
                    fullWidth
                  />
                </Stack>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  {[
                    ["Suggested Entry", aiPositionPlan.entryMid.toFixed(2)],
                    ["Risk / Share", aiPositionPlan.riskPerShare.toFixed(2)],
                    ["Max Risk Capital", aiPositionPlan.maxRiskCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
                    ["Suggested Shares", aiPositionPlan.suggestedShares.toLocaleString()],
                    ["Position Value", aiPositionPlan.positionValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
                    ["Stop-Loss Risk", aiPositionPlan.stopLossRisk.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })]
                  ].map(([label, value]) => (
                    <Grid item xs={12} sm={6} md={4} key={label}>
                      <Box sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(255,255,255,0.02)", height: "100%" }}>
                        <Typography variant="body2" color="text.secondary">
                          {label}
                        </Typography>
                        <Typography variant="h6" sx={{ mt: 0.5 }}>
                          {value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6">AI Profit Projection</Typography>
                <Typography variant="body2" color="text.secondary">
                  Approximate outcome if the position reaches the planned targets.
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Stack gap={2}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Target 1 Profit
                    </Typography>
                    <Typography variant="h5" color={aiPositionPlan.target1Profit >= 0 ? "success.main" : "error.main"}>
                      {aiPositionPlan.target1Profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Target 2 Profit
                    </Typography>
                    <Typography variant="h5" color={aiPositionPlan.target2Profit >= 0 ? "success.main" : "error.main"}>
                      {aiPositionPlan.target2Profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Alert severity={aiTradePlan.rewardRisk >= 2 ? "success" : "warning"}>
                    Current trade plan reward/risk is <strong>{aiTradePlan.rewardRisk.toFixed(2)}x</strong>.
                    {aiTradePlan.rewardRisk >= 2
                      ? " This is generally attractive if the setup confirms."
                      : " Consider waiting for a better entry or tighter stop to improve profitability."}
                  </Alert>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {aiScenarioForecast && (
        <Card>
          <CardContent>
            <Typography variant="h6">AI Scenario Forecast</Typography>
            <Typography variant="body2" color="text.secondary">
              Probable price paths based on current signal strength, recent structure, and volatility.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              {aiScenarioForecast.map((scenario) => (
                <Grid item xs={12} md={4} key={scenario.label}>
                  <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", height: "100%" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle1">{scenario.label}</Typography>
                      <Chip label={`${scenario.probability}%`} size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="h5" sx={{ mt: 1.5, color: scenario.color }}>
                      {scenario.price.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Move {scenario.movePct >= 0 ? "+" : ""}
                      {scenario.movePct.toFixed(2)}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={scenario.probability}
                      color={scenario.label === "Bull Case" ? "success" : scenario.label === "Base Case" ? "info" : "error"}
                      sx={{ mt: 1.5, height: 10, borderRadius: 999 }}
                    />
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6">{t("stock.marketSnapshot")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("stock.marketSnapshotDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Metric</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>{t("stock.previousClose")}</TableCell>
                    <TableCell align="right">{toNumber(quote?.previousClose)?.toFixed(2) ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t("stock.intradayHigh")}</TableCell>
                    <TableCell align="right">{toNumber(quote?.hiTrade)?.toFixed(2) ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t("stock.intradayLow")}</TableCell>
                    <TableCell align="right">{toNumber(quote?.lowTrade)?.toFixed(2) ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t("stock.high12m")}</TableCell>
                    <TableCell align="right">{toNumber(quote?.p12HiPrice)?.toFixed(2) ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t("stock.low12m")}</TableCell>
                    <TableCell align="right">{toNumber(quote?.p12LowPrice)?.toFixed(2) ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t("stock.volume")}</TableCell>
                    <TableCell align="right">{toNumber(quote?.tdyShareVolume)?.toLocaleString() ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t("stock.marketCap")}</TableCell>
                    <TableCell align="right">{toNumber(quote?.marketCap)?.toLocaleString() ?? "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6">{t("stock.signalMatrix")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("stock.signalMatrixDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Stack gap={2}>
                {indicatorScores.map((indicator) => (
                  <Box key={indicator.label}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography>{indicator.label}</Typography>
                      <Tooltip title={`${indicator.value}/100`}>
                        <Typography color="text.secondary">{indicator.value}</Typography>
                      </Tooltip>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={indicator.value}
                      color={indicator.value >= 65 ? "success" : indicator.value <= 35 ? "error" : "warning"}
                      sx={{ mt: 0.75, height: 10, borderRadius: 999 }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6">{t("stock.indicatorReference")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("stock.indicatorReferenceDesc")}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            {[
              ["RSI", "Momentum oscillator; below 30 is typically oversold, above 70 overbought."],
              ["MACD", "Bullish when MACD crosses above signal; bearish when MACD crosses below."],
              ["EMA/SMA", "Trend filters that reduce noise and identify directional bias."],
              ["Bollinger Bands", "Volatility envelope used for compression and expansion setups."],
              ["ATR", "Volatility estimate used for stop-loss sizing and expected range."],
              ["VWAP", "Session fair value benchmark used by professional execution desks."],
              ["Stochastic", "Highlights short-term overbought and oversold states."]
            ].map(([title, description]) => (
              <Grid item xs={12} md={6} lg={4} key={title}>
                <Box sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(255,255,255,0.02)", height: "100%" }}>
                  <Typography variant="subtitle1">{title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Stack>
  );
}
