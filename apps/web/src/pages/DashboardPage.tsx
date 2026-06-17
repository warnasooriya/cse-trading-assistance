import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { fetchMarketDashboard, fetchPortfolio } from "../api/marketDataApi";
import { executionTimeline, sentimentFeed } from "../data/enterpriseMock";
import { useI18n } from "../i18n/I18nProvider";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getIndexValue(index: unknown): number | null {
  if (index && typeof index === "object" && "value" in index) {
    return asNumber((index as any).value);
  }
  return null;
}

function getIndexChangePct(index: unknown): number | null {
  if (index && typeof index === "object" && "changePercent" in index) {
    return asNumber((index as any).changePercent);
  }
  if (index && typeof index === "object" && "changePercentage" in index) {
    return asNumber((index as any).changePercentage);
  }
  return null;
}

function getRowSymbol(row: unknown): string {
  if (row && typeof row === "object" && "symbol" in row) return String((row as any).symbol);
  return "";
}

function getRowPrice(row: unknown): number | null {
  if (row && typeof row === "object" && "price" in row) return asNumber((row as any).price);
  if (row && typeof row === "object" && "lastTradedPrice" in row) return asNumber((row as any).lastTradedPrice);
  return null;
}

function getRowChangePct(row: unknown): number | null {
  if (row && typeof row === "object" && "changePercentage" in row) return asNumber((row as any).changePercentage);
  if (row && typeof row === "object" && "changePercent" in row) return asNumber((row as any).changePercent);
  return null;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["market", "dashboard"],
    queryFn: fetchMarketDashboard,
    refetchInterval: 15_000
  });

  const portfolioQuery = useQuery({
    queryKey: ["portfolio"],
    queryFn: fetchPortfolio,
    refetchInterval: 15_000
  });

  const portfolioHoldings = portfolioQuery.data?.holdings ?? [];
  const totalPortfolioValue = portfolioHoldings.reduce((sum, holding) => sum + holding.quantity * (holding.marketPrice ?? holding.avgCost), 0);
  const unrealizedPnl = portfolioHoldings.reduce(
    (sum, holding) => sum + holding.quantity * ((holding.marketPrice ?? holding.avgCost) - holding.avgCost),
    0
  );
  const topExposure = useMemo(() => {
    const values = portfolioHoldings.map((h) => h.quantity * (h.marketPrice ?? h.avgCost));
    const top = values.length ? Math.max(...values) : 0;
    return totalPortfolioValue ? (top / totalPortfolioValue) * 100 : 0;
  }, [portfolioHoldings, totalPortfolioValue]);
  const riskScore = Math.max(0, Math.min(100, 92 - topExposure * 1.2));
  const availableCash = 12_450_000;

  const sectorAllocation = useMemo(() => {
    if (!totalPortfolioValue) return [];
    return portfolioHoldings
      .map((holding) => {
        const marketValue = holding.quantity * (holding.marketPrice ?? holding.avgCost);
        return { name: holding.symbol, value: (marketValue / totalPortfolioValue) * 100 };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [portfolioHoldings, totalPortfolioValue]);

  if (isLoading) {
    return (
      <Stack direction="row" alignItems="center" gap={2}>
        <CircularProgress size={20} />
        <Typography>Loading market dashboard…</Typography>
      </Stack>
    );
  }

  if (error || !data) {
    return <Alert severity="error">{(error as Error)?.message ?? "Failed to load dashboard"}</Alert>;
  }

  const aspiValue = getIndexValue(data.indices.aspi);
  const aspiChangePct = getIndexChangePct(data.indices.aspi);
  const snpValue = getIndexValue(data.indices.snp);
  const snpChangePct = getIndexChangePct(data.indices.snp);

  const sectorChartData = data.sectorPerformance.filter((s) => typeof s.changePct === "number").slice(0, 12);
  const topSignals = [...data.topGainers.slice(0, 4), ...data.topLosers.slice(0, 2)];

  return (
    <Stack gap={3}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", lg: "center" }}
        gap={2}
      >
        <Box>
          <Typography variant="h4">{t("dashboard.title")}</Typography>
          <Typography color="text.secondary">
            {data.status.status} | {t("dashboard.subtitle")}
          </Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Chip label={t("dashboard.recommendationOnline")} color="primary" />
          <Chip label={t("dashboard.riskMonitoring")} color="warning" />
          <Button variant="contained" onClick={() => navigate("/alerts?create=1")}>
            {t("dashboard.createAlert")}
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} xl={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">ASPI</Typography>
              <Typography variant="h4">{aspiValue?.toLocaleString() ?? "—"}</Typography>
              <Typography color={typeof aspiChangePct === "number" && aspiChangePct < 0 ? "error" : "success.main"}>
                {typeof aspiChangePct === "number" ? `${aspiChangePct.toFixed(2)}%` : "—"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} xl={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">S&P SL20</Typography>
              <Typography variant="h4">{snpValue?.toLocaleString() ?? "—"}</Typography>
              <Typography color={typeof snpChangePct === "number" && snpChangePct < 0 ? "error" : "success.main"}>
                {typeof snpChangePct === "number" ? `${snpChangePct.toFixed(2)}%` : "—"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} xl={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">{t("dashboard.managedPortfolioValue")}</Typography>
              <Typography variant="h4">{totalPortfolioValue.toLocaleString()}</Typography>
              <Typography color={unrealizedPnl >= 0 ? "success.main" : "error"}>
                {t("dashboard.unrealizedPnl")} {unrealizedPnl >= 0 ? "+" : ""}
                {unrealizedPnl.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} xl={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">{t("dashboard.riskPosture")}</Typography>
              <Typography variant="h4">{riskScore}/100</Typography>
              <LinearProgress
                variant="determinate"
                value={riskScore}
                color={riskScore > 70 ? "error" : riskScore > 45 ? "warning" : "success"}
                sx={{ mt: 1, height: 10, borderRadius: 999 }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} xl={8}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="h6">{t("dashboard.sectorLeadership")}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("dashboard.sectorLeadershipDesc")}
                  </Typography>
                </Box>
                <Chip label="Live Heatmap Proxy" variant="outlined" />
              </Stack>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={sectorChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="symbol" />
                    <YAxis tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
                    <Bar dataKey="changePct" radius={[8, 8, 0, 0]}>
                      {sectorChartData.map((entry) => (
                        <Cell key={entry.sectorId} fill={(entry.changePct ?? 0) >= 0 ? "#25c2a0" : "#ff5f7a"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={4}>
          <Card>
            <CardContent>
              <Typography variant="h6">{t("dashboard.executionTimeline")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("dashboard.executionTimelineDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <AreaChart data={executionTimeline}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="exposure" stroke="#4f8cff" fill="rgba(79,140,255,0.25)" />
                    <Line type="monotone" dataKey="pnl" stroke="#25c2a0" />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} xl={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">{t("dashboard.tradingSignals")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("dashboard.tradingSignalsDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Symbol</TableCell>
                      <TableCell align="right">Price</TableCell>
                      <TableCell align="right">Change</TableCell>
                      <TableCell align="right">{t("dashboard.actionBias")}</TableCell>
                      <TableCell align="right">{t("common.actions")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topSignals.map((row, idx) => {
                      const change = getRowChangePct(row) ?? 0;
                      return (
                        <TableRow key={`${getRowSymbol(row)}-${idx}`}>
                          <TableCell>{getRowSymbol(row)}</TableCell>
                          <TableCell align="right">{getRowPrice(row)?.toFixed(2) ?? "—"}</TableCell>
                          <TableCell align="right" sx={{ color: change >= 0 ? "success.main" : "error.main" }}>
                            {change.toFixed(2)}%
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small"
                              label={change >= 0 ? t("dashboard.momentumLong") : t("dashboard.meanReversion")}
                              color={change >= 0 ? "success" : "warning"}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              onClick={() => navigate(`/stocks?symbol=${encodeURIComponent(getRowSymbol(row))}`)}
                            >
                              {t("common.review")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6">{t("dashboard.sectorAllocation")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("dashboard.allocationDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={sectorAllocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                      {sectorAllocation.map((entry, index) => (
                        <Cell key={entry.name} fill={["#4f8cff", "#25c2a0", "#ffb14a", "#c084fc"][index % 4]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6">{t("dashboard.liquidity")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("dashboard.liquidityDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Stack gap={2}>
                <Box>
                  <Typography variant="body2" color="text.secondary">{t("dashboard.availableCash")}</Typography>
                  <Typography variant="h5">{availableCash.toLocaleString()}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">{t("dashboard.mostActiveCounters")}</Typography>
                  <Stack gap={1} sx={{ mt: 1 }}>
                    {data.mostActive.slice(0, 4).map((row, idx) => (
                      <Stack key={`${getRowSymbol(row)}-${idx}`} direction="row" justifyContent="space-between">
                        <Typography>{getRowSymbol(row)}</Typography>
                        <Typography>{getRowPrice(row)?.toFixed(2) ?? "—"}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} xl={7}>
          <Card>
            <CardContent>
              <Typography variant="h6">{t("dashboard.portfolioMonitor")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("dashboard.portfolioMonitorDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("dashboard.counter")}</TableCell>
                      <TableCell>Sector</TableCell>
                      <TableCell align="right">{t("dashboard.qty")}</TableCell>
                      <TableCell align="right">{t("dashboard.avgCost")}</TableCell>
                      <TableCell align="right">LTP</TableCell>
                      <TableCell align="right">P/L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {portfolioHoldings.map((holding) => {
                      const marketPrice = holding.marketPrice ?? holding.avgCost;
                      const pnl = holding.quantity * (marketPrice - holding.avgCost);
                      return (
                        <TableRow key={holding.symbol}>
                          <TableCell>
                            <Typography variant="subtitle2">{holding.symbol}</Typography>
                            <Typography variant="caption" color="text.secondary">{holding.name}</Typography>
                          </TableCell>
                          <TableCell>{holding.sector}</TableCell>
                          <TableCell align="right">{holding.quantity.toLocaleString()}</TableCell>
                          <TableCell align="right">{holding.avgCost.toFixed(2)}</TableCell>
                          <TableCell align="right">{marketPrice.toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ color: pnl >= 0 ? "success.main" : "error.main" }}>
                            {pnl.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} xl={5}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6">{t("dashboard.newsRadar")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("dashboard.newsRadarDesc")}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Stack gap={1.5}>
                {sentimentFeed.map((item) => (
                  <Box key={item.id} sx={{ p: 1.5, borderRadius: 3, bgcolor: "rgba(255,255,255,0.02)" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                      <Typography variant="subtitle2">{item.headline[language]}</Typography>
                      <Chip
                        size="small"
                        label={
                          item.sentiment === "Positive"
                            ? t("news.positive")
                            : item.sentiment === "Negative"
                              ? t("news.negative")
                              : t("news.neutral")
                        }
                        color={
                          item.sentiment === "Positive"
                            ? "success"
                            : item.sentiment === "Negative"
                              ? "error"
                              : "warning"
                        }
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {item.symbol} | {item.source} | {t("dashboard.score")} {item.score}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {item.summary[language]}
                    </Typography>
                  </Box>
                ))}
              </Stack>
              <Button sx={{ mt: 2 }} variant="outlined" onClick={() => navigate("/news")}>
                {t("common.viewAll")}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
