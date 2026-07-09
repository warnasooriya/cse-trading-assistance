import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { deletePortfolioHolding, fetchMarketWatch, fetchPortfolio, fetchPortfolioCopilot, upsertPortfolioHolding } from "../api/marketDataApi";
import type { MarketWatchItem } from "../api/marketDataApi";

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

const DEFAULT_SALES_COMMISSION_RATE = 1.12;

export function PortfolioPage() {
  const queryClient = useQueryClient();
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<MarketWatchItem | null>(null);
  const [symbol, setSymbol] = useState("JKH.N0000");
  const [name, setName] = useState("John Keells Holdings");
  const [sector, setSector] = useState("");
  const [quantity, setQuantity] = useState(1000);
  const [avgCost, setAvgCost] = useState(100);
  const [buyCommission, setBuyCommission] = useState(0);
  const [sellCommissionRate, setSellCommissionRate] = useState(DEFAULT_SALES_COMMISSION_RATE);

  const portfolioQuery = useQuery({
    queryKey: ["portfolio"],
    queryFn: fetchPortfolio,
    staleTime: 5_000
  });

  const portfolioCopilotQuery = useQuery({
    queryKey: ["portfolio", "copilot"],
    queryFn: fetchPortfolioCopilot,
    staleTime: 15_000
  });

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

  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertPortfolioHolding({
        symbol: symbol.trim().toUpperCase(),
        name: name.trim() || undefined,
        sector: sector.trim() || undefined,
        quantity,
        avgCost,
        buyCommission,
        sellCommissionRate
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      setShowAddHolding(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (s: string) => deletePortfolioHolding(s),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    }
  });

  const holdings = portfolioQuery.data?.holdings ?? [];
  const summary = portfolioQuery.data?.summary;

  const sectorAllocation = useMemo(() => {
    if (!summary?.totalMarketValue) return [];

    const totals = new Map<string, number>();
    for (const holding of holdings) {
      const sectorName = holding.sector?.trim() || "Unclassified";
      totals.set(sectorName, (totals.get(sectorName) ?? 0) + holding.marketValue);
    }

    return Array.from(totals.entries())
      .map(([name, amount]) => ({
        name,
        amount,
        value: (amount / summary.totalMarketValue) * 100
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [holdings, summary?.totalMarketValue]);

  const portfolioInsights = useMemo(() => {
    const largestPosition = [...holdings].sort((a, b) => b.weightPct - a.weightPct)[0] ?? null;
    const bestPerformer = [...holdings].sort((a, b) => b.netProfit - a.netProfit)[0] ?? null;
    const worstPerformer = [...holdings].sort((a, b) => a.netProfit - b.netProfit)[0] ?? null;
    const largestSector = [...sectorAllocation].sort((a, b) => b.amount - a.amount)[0] ?? null;
    return { largestPosition, bestPerformer, worstPerformer, largestSector };
  }, [holdings, sectorAllocation]);

  const companyOptions = companyLookupQuery.data?.items ?? [];
  const totalFees = (summary?.totalBuyCommission ?? 0) + (summary?.totalEstimatedSellCommission ?? 0);
  const summaryCards = [
    {
      label: "Total Cost",
      value: formatMoney(summary?.totalInvested ?? 0),
      hint: "Broker-style total cost based on avg price x quantity"
    },
    {
      label: "Market Value",
      value: formatMoney(summary?.totalMarketValue ?? 0),
      hint: "Current marked portfolio value"
    },
    {
      label: "Net Proceeds",
      value: formatMoney(summary?.totalEstimatedNetProceeds ?? 0),
      hint: "Estimated cash received after sell-side commissions"
    },
    {
      label: "Total Fees",
      value: formatMoney(totalFees),
      hint: "Recorded buy commission plus estimated sell-side commissions"
    },
    {
      label: "Net P/L",
      value: formatMoney(summary?.totalNetProfit ?? 0),
      hint: "Profit after all modeled commissions"
    },
    {
      label: "Net Return",
      value: formatPercent(summary?.netReturnPct ?? 0),
      hint: "Return based on total cost after sell-side charges"
    }
  ];

  return (
    <Stack gap={3}>
      <Typography variant="h4">Portfolio Command Center</Typography>
      <Typography color="text.secondary">
        Holdings, sector concentration, cost basis, fee impact, and estimated proceeds after commissions.
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }} gap={1.5}>
        <Typography color="text.secondary">
          Portfolio: {portfolioQuery.data?.name ?? "Primary"} {summary ? `| ${formatMoney(summary.totalMarketValue)}` : ""}
        </Typography>
        <Button variant="contained" onClick={() => setShowAddHolding((v) => !v)}>
          {showAddHolding ? "Close" : "Add Holding"}
        </Button>
      </Stack>

      {portfolioQuery.isLoading && (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={18} />
          <Typography color="text.secondary">Loading...</Typography>
        </Stack>
      )}
      {portfolioQuery.error && <Alert severity="error">{(portfolioQuery.error as Error).message}</Alert>}

      {showAddHolding && (
        <Card>
          <CardContent>
            <Typography variant="h6">Add / Update Holding</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Save holdings with sector details and commission assumptions into your local PostgreSQL portfolio.
              The default sell-side charge uses the Atrade sample rate of 1.12%. Avg Cost is treated as the broker
              average cost already reflected in total cost.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Stack direction={{ xs: "column", lg: "row" }} gap={2}>
              <Autocomplete
                fullWidth
                options={companyOptions}
                value={selectedCompany}
                inputValue={companySearch}
                onInputChange={(_, value) => setCompanySearch(value)}
                onChange={(_, value) => {
                  setSelectedCompany(value);
                  if (value) {
                    setSymbol(value.symbol);
                    setName(value.name);
                    setSector("");
                    setCompanySearch(`${value.name} (${value.symbol})`);
                  }
                }}
                isOptionEqualToValue={(option, value) => option.symbol === value.symbol}
                getOptionLabel={(option) => `${option.name} (${option.symbol})`}
                renderInput={(params) => <TextField {...params} label="Company lookup" />}
              />
              <TextField label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} fullWidth />
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
              <TextField label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} fullWidth />
              <TextField label="Quantity" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} fullWidth />
              <TextField label="Avg Cost" type="number" value={avgCost} onChange={(e) => setAvgCost(Number(e.target.value))} fullWidth />
              <TextField
                label="Buy Commission"
                type="number"
                value={buyCommission}
                onChange={(e) => setBuyCommission(Number(e.target.value))}
                fullWidth
              />
              <TextField
                label="Est. Sell Commission %"
                type="number"
                value={sellCommissionRate}
                onChange={(e) => setSellCommissionRate(Number(e.target.value))}
                fullWidth
              />
            </Stack>
            <Stack direction="row" gap={1.5} sx={{ mt: 2 }}>
              <Button variant="contained" onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? "Saving..." : "Save Holding"}
              </Button>
              <Button variant="outlined" onClick={() => setShowAddHolding(false)}>
                Cancel
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        {summaryCards.map((card) => (
          <Grid item xs={12} sm={6} xl={2} key={card.label}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  {card.label}
                </Typography>
                <Typography variant="h5" sx={{ mt: 1 }}>
                  {card.value}
                </Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                  {card.hint}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {portfolioCopilotQuery.data && (
        <Card>
          <CardContent>
            <Typography variant="h6">Portfolio AI Copilot</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Portfolio-aware multi-stock orchestration using holdings, concentration, profitability, and recent market news.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Alert severity={portfolioCopilotQuery.data.portfolioHealth === "Strong" ? "success" : portfolioCopilotQuery.data.portfolioHealth === "Balanced" ? "info" : "warning"}>
              {portfolioCopilotQuery.data.summary}
            </Alert>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              {[
                { label: "Add Ideas", items: portfolioCopilotQuery.data.addIdeas },
                { label: "Reduce Ideas", items: portfolioCopilotQuery.data.reduceIdeas },
                { label: "Rebalance Actions", items: portfolioCopilotQuery.data.rebalanceActions },
                { label: "Risk Alerts", items: portfolioCopilotQuery.data.riskAlerts }
              ].map((section) => (
                <Grid item xs={12} md={6} key={section.label}>
                  <Card variant="outlined" sx={{ height: "100%", bgcolor: "rgba(255,255,255,0.02)" }}>
                    <CardContent>
                      <Typography variant="subtitle1">{section.label}</Typography>
                      <Stack gap={1} sx={{ mt: 1.25 }}>
                        {section.items.length > 0 ? (
                          section.items.map((item) => (
                            <Typography key={item} variant="body2" color="text.secondary">
                              - {item}
                            </Typography>
                          ))
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No immediate action flagged.
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} xl={8}>
          <Card>
            <CardContent>
              <Typography variant="h6">Current Holdings</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Review total cost, sales proceeds, break-even pricing, and net profit after sales commission.
              </Typography>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ mt: 2, minWidth: 1520 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Symbol</TableCell>
                      <TableCell>Sector</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Avg Cost</TableCell>
                      <TableCell align="right">Buy Comm.</TableCell>
                      <TableCell align="right">Sell Fee %</TableCell>
                      <TableCell align="right">Total Cost</TableCell>
                      <TableCell align="right">Market Price</TableCell>
                      <TableCell align="right">Market Value</TableCell>
                      <TableCell align="right">Net Proceeds</TableCell>
                      <TableCell align="right">Gross P/L</TableCell>
                      <TableCell align="right">Net P/L</TableCell>
                      <TableCell align="right">Weight</TableCell>
                      <TableCell align="right">Break-even</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {holdings.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={15} align="center">
                          No holdings saved yet. Add your first position to start tracking investor metrics.
                        </TableCell>
                      </TableRow>
                    )}
                    {holdings.map((holding) => {
                      const marketPrice = holding.marketPrice ?? holding.avgCost;
                      return (
                        <TableRow key={holding.symbol}>
                          <TableCell>{holding.symbol}</TableCell>
                          <TableCell>{holding.sector}</TableCell>
                          <TableCell align="right">{holding.quantity.toLocaleString()}</TableCell>
                          <TableCell align="right">{holding.avgCost.toFixed(2)}</TableCell>
                          <TableCell align="right">{formatMoney(holding.buyCommission)}</TableCell>
                          <TableCell align="right">{formatPercent(holding.sellCommissionRate)}</TableCell>
                          <TableCell align="right">{formatMoney(holding.totalInvested)}</TableCell>
                          <TableCell align="right">{marketPrice.toFixed(2)}</TableCell>
                          <TableCell align="right">{formatMoney(holding.marketValue)}</TableCell>
                          <TableCell align="right">{formatMoney(holding.estimatedNetProceeds)}</TableCell>
                          <TableCell align="right" sx={{ color: holding.grossProfit >= 0 ? "success.main" : "error.main" }}>
                            {formatMoney(holding.grossProfit)}
                          </TableCell>
                          <TableCell align="right" sx={{ color: holding.netProfit >= 0 ? "success.main" : "error.main" }}>
                            {formatMoney(holding.netProfit)}
                          </TableCell>
                          <TableCell align="right">{formatPercent(holding.weightPct)}</TableCell>
                          <TableCell align="right">{formatMoney(holding.breakEvenPrice)}</TableCell>
                          <TableCell align="right">
                            <Button size="small" color="error" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(holding.symbol)}>
                              Delete
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

        <Grid item xs={12} xl={4}>
          <Stack gap={2} sx={{ height: "100%" }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Sector Allocation</Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {formatMoney(summary?.totalMarketValue ?? 0)}
                </Typography>
                <Typography color="text.secondary">Current market value allocated by sector</Typography>
                <Stack sx={{ mt: 2, height: 260 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={sectorAllocation} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                        {sectorAllocation.map((entry, index) => (
                          <Cell key={entry.name} fill={["#4f8cff", "#25c2a0", "#ffb14a", "#c084fc", "#ff6b6b", "#00bcd4"][index % 6]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number, _name, item) => [`${value.toFixed(2)}%`, item?.payload?.name ?? "Sector"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </Stack>
                <Stack gap={1}>
                  {sectorAllocation.map((entry) => (
                    <Stack key={entry.name} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">{entry.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatMoney(entry.amount)} | {formatPercent(entry.value)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ flexGrow: 1 }}>
              <CardContent>
                <Typography variant="h6">Investor Insights</Typography>
                <Stack gap={1.5} sx={{ mt: 2 }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Largest Position
                    </Typography>
                    <Typography variant="body1">
                      {portfolioInsights.largestPosition
                        ? `${portfolioInsights.largestPosition.symbol} | ${formatPercent(portfolioInsights.largestPosition.weightPct)}`
                        : "No holdings"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Best Net Contributor
                    </Typography>
                    <Typography variant="body1">
                      {portfolioInsights.bestPerformer
                        ? `${portfolioInsights.bestPerformer.symbol} | ${formatMoney(portfolioInsights.bestPerformer.netProfit)}`
                        : "No holdings"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Weakest Net Contributor
                    </Typography>
                    <Typography variant="body1">
                      {portfolioInsights.worstPerformer
                        ? `${portfolioInsights.worstPerformer.symbol} | ${formatMoney(portfolioInsights.worstPerformer.netProfit)}`
                        : "No holdings"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Largest Sector Exposure
                    </Typography>
                    <Typography variant="body1">
                      {portfolioInsights.largestSector
                        ? `${portfolioInsights.largestSector.name} | ${formatPercent(portfolioInsights.largestSector.value)}`
                        : "Unclassified"}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
