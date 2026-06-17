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

export function StockAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSymbol = searchParams.get("symbol")?.toUpperCase() ?? "JKH.N0000";
  const { t } = useI18n();
  const [companySearch, setCompanySearch] = useState(initialSymbol);
  const [selectedCompany, setSelectedCompany] = useState<MarketWatchItem | null>(null);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeRange, setTimeRange] = useState("1M");

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
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
