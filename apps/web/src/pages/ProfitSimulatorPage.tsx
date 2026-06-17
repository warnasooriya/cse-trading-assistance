import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Card,
  CardContent,
  Divider,
  Grid,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import { fetchMarketWatch } from "../api/marketDataApi";
import type { MarketWatchItem } from "../api/marketDataApi";

type FeeMode = "BOTH" | "SELL_ONLY" | "BUY_ONLY" | "NONE";
type ScenarioMode = "SELL_PRICE" | "TARGET_NET_RETURN_PCT" | "TARGET_NET_PROFIT";

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function ProfitSimulatorPage() {
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<MarketWatchItem | null>(null);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");

  const [capital, setCapital] = useState(100_000);
  const [buyPrice, setBuyPrice] = useState(100);
  const [sellPrice, setSellPrice] = useState(110);
  const [targetNetReturnPct, setTargetNetReturnPct] = useState(5);
  const [targetNetProfit, setTargetNetProfit] = useState(10_000);

  const [feeMode, setFeeMode] = useState<FeeMode>("BOTH");
  const [buyFeeRatePct, setBuyFeeRatePct] = useState(1.12);
  const [sellFeeRatePct, setSellFeeRatePct] = useState(1.12);
  const [lotSize, setLotSize] = useState(1);
  const [scenarioMode, setScenarioMode] = useState<ScenarioMode>("SELL_PRICE");

  const companyLookupQuery = useQuery({
    queryKey: ["market", "watch", "lookup", "profit-sim", companySearch],
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

  const companyOptions = companyLookupQuery.data?.items ?? [];

  const normalizedFeeRates = useMemo(() => {
    const buyPct = clampFinite(buyFeeRatePct, 0, 100);
    const sellPct = clampFinite(sellFeeRatePct, 0, 100);

    if (feeMode === "NONE") return { buyPct: 0, sellPct: 0 };
    if (feeMode === "BUY_ONLY") return { buyPct, sellPct: 0 };
    if (feeMode === "SELL_ONLY") return { buyPct: 0, sellPct };
    return { buyPct, sellPct };
  }, [buyFeeRatePct, feeMode, sellFeeRatePct]);

  const computed = useMemo(() => {
    const safeCapital = Math.max(0, Number(capital) || 0);
    const safeBuyPrice = Math.max(0, Number(buyPrice) || 0);
    const safeSellPrice = Math.max(0, Number(sellPrice) || 0);
    const safeLotSize = Math.max(1, Math.floor(Number(lotSize) || 1));
    const buyPct = normalizedFeeRates.buyPct / 100;
    const sellPct = normalizedFeeRates.sellPct / 100;

    if (!safeCapital || !safeBuyPrice) {
      return {
        shares: 0,
        remainingCash: safeCapital,
        buyGross: 0,
        buyFees: 0,
        totalBuy: 0,
        sellGross: 0,
        sellFees: 0,
        netSell: 0,
        netProfit: 0,
        netReturnPct: 0,
        breakEvenSellPrice: 0,
        targetSellPrice: 0
      };
    }

    const costPerShareWithFees = safeBuyPrice * (1 + buyPct);
    const rawShares = Math.floor(safeCapital / costPerShareWithFees);
    const shares = Math.floor(rawShares / safeLotSize) * safeLotSize;

    const buyGross = shares * safeBuyPrice;
    const buyFees = buyGross * buyPct;
    const totalBuy = buyGross + buyFees;
    const remainingCash = safeCapital - totalBuy;

    const sellGross = shares * safeSellPrice;
    const sellFees = sellGross * sellPct;
    const netSell = sellGross - sellFees;
    const netProfit = netSell - totalBuy;
    const netReturnPct = totalBuy > 0 ? (netProfit / totalBuy) * 100 : 0;

    const breakEvenSellPrice =
      shares > 0 && sellPct < 1 ? totalBuy / (shares * (1 - sellPct)) : 0;

    let targetSellPrice = 0;
    if (scenarioMode === "TARGET_NET_RETURN_PCT" && shares > 0 && sellPct < 1) {
      const pct = Number(targetNetReturnPct) || 0;
      const targetNetSell = totalBuy * (1 + pct / 100);
      targetSellPrice = targetNetSell / (shares * (1 - sellPct));
    } else if (scenarioMode === "TARGET_NET_PROFIT" && shares > 0 && sellPct < 1) {
      const target = Number(targetNetProfit) || 0;
      const targetNetSell = totalBuy + target;
      targetSellPrice = targetNetSell / (shares * (1 - sellPct));
    }

    return {
      shares,
      remainingCash,
      buyGross,
      buyFees,
      totalBuy,
      sellGross,
      sellFees,
      netSell,
      netProfit,
      netReturnPct,
      breakEvenSellPrice,
      targetSellPrice
    };
  }, [buyPrice, capital, lotSize, normalizedFeeRates.buyPct, normalizedFeeRates.sellPct, scenarioMode, sellPrice, targetNetProfit, targetNetReturnPct]);

  const feeInfo = (
    <Typography color="text.secondary" variant="body2">
      Default total transaction cost is commonly shown as ~1.12% (brokerage + CSE + CDS + SEC + levy). Sources: NDB Securities FAQ and Genie Stocks
      Trading product pages.
    </Typography>
  );

  return (
    <Stack gap={3}>
      <Typography variant="h4">Profit Simulator</Typography>
      <Typography color="text.secondary">
        Simulate net profit and target sell prices with CSE-style transaction costs.
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6">Company</Typography>
          <Divider sx={{ my: 2 }} />
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
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
                  const live = typeof value.price === "number" && Number.isFinite(value.price) ? value.price : null;
                  if (live !== null) {
                    setBuyPrice(live);
                    setSellPrice(Number((live * 1.05).toFixed(2)));
                  }
                  setCompanySearch(`${value.name} (${value.symbol})`);
                }
              }}
              isOptionEqualToValue={(option, value) => option.symbol === value.symbol}
              getOptionLabel={(option) => `${option.name} (${option.symbol})`}
              renderInput={(params) => <TextField {...params} label="Company lookup" />}
            />
            <TextField label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} fullWidth />
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">Inputs</Typography>
              <Divider sx={{ my: 2 }} />

              <Stack gap={2}>
                <TextField
                  label="Total Capital (LKR)"
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(Number(e.target.value))}
                  fullWidth
                />
                <TextField
                  label="Buying Price (LKR)"
                  type="number"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(Number(e.target.value))}
                  fullWidth
                />

                <ToggleButtonGroup
                  value={scenarioMode}
                  exclusive
                  onChange={(_, value) => {
                    if (value) setScenarioMode(value as ScenarioMode);
                  }}
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                >
                  <ToggleButton value="SELL_PRICE">Known Sell Price</ToggleButton>
                  <ToggleButton value="TARGET_NET_RETURN_PCT">Target Net Return %</ToggleButton>
                  <ToggleButton value="TARGET_NET_PROFIT">Target Net Profit</ToggleButton>
                </ToggleButtonGroup>

                {scenarioMode === "SELL_PRICE" && (
                  <TextField
                    label="Selling Price (LKR)"
                    type="number"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(Number(e.target.value))}
                    fullWidth
                  />
                )}

                {scenarioMode === "TARGET_NET_RETURN_PCT" && (
                  <TextField
                    label="Target Net Return (%)"
                    type="number"
                    value={targetNetReturnPct}
                    onChange={(e) => setTargetNetReturnPct(Number(e.target.value))}
                    fullWidth
                  />
                )}

                {scenarioMode === "TARGET_NET_PROFIT" && (
                  <TextField
                    label="Target Net Profit (LKR)"
                    type="number"
                    value={targetNetProfit}
                    onChange={(e) => setTargetNetProfit(Number(e.target.value))}
                    fullWidth
                  />
                )}

                <TextField
                  label="Lot Size (shares)"
                  type="number"
                  value={lotSize}
                  onChange={(e) => setLotSize(Number(e.target.value))}
                  fullWidth
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">Fees & Rules</Typography>
              <Divider sx={{ my: 2 }} />

              <Stack gap={2}>
                {feeInfo}
                <ToggleButtonGroup
                  value={feeMode}
                  exclusive
                  onChange={(_, value) => {
                    if (value) setFeeMode(value as FeeMode);
                  }}
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                >
                  <ToggleButton value="BOTH">Buy + Sell</ToggleButton>
                  <ToggleButton value="SELL_ONLY">Sell Only</ToggleButton>
                  <ToggleButton value="BUY_ONLY">Buy Only</ToggleButton>
                  <ToggleButton value="NONE">No Fees</ToggleButton>
                </ToggleButtonGroup>

                <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                  <TextField
                    label="Buy Fee Rate (%)"
                    type="number"
                    value={buyFeeRatePct}
                    onChange={(e) => setBuyFeeRatePct(Number(e.target.value))}
                    fullWidth
                    disabled={feeMode === "NONE" || feeMode === "SELL_ONLY"}
                  />
                  <TextField
                    label="Sell Fee Rate (%)"
                    type="number"
                    value={sellFeeRatePct}
                    onChange={(e) => setSellFeeRatePct(Number(e.target.value))}
                    fullWidth
                    disabled={feeMode === "NONE" || feeMode === "BUY_ONLY"}
                  />
                </Stack>

                {feeMode !== "BOTH" && (
                  <Alert severity="warning">
                    Some brokers may apply different fee components on buy vs sell (or intraday). Use the toggle to match your broker statement.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6">Results</Typography>
          <Divider sx={{ my: 2 }} />

          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    Shares
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>
                    {computed.shares.toLocaleString()}
                  </Typography>
                  <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                    Remaining cash: {formatMoney(computed.remainingCash)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    Total Buy (incl. fees)
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>
                    {formatMoney(computed.totalBuy)}
                  </Typography>
                  <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                    Buy fees: {formatMoney(computed.buyFees)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    Net Sell (after fees)
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>
                    {formatMoney(computed.netSell)}
                  </Typography>
                  <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                    Sell fees: {formatMoney(computed.sellFees)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    Net Profit
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 1, color: computed.netProfit >= 0 ? "success.main" : "error.main" }}>
                    {formatMoney(computed.netProfit)}
                  </Typography>
                  <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                    Net return: {formatPercent(computed.netReturnPct)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ mt: 2 }}>
            <Typography color="text.secondary" variant="body2">
              Break-even sell price (after fees): {formatMoney(computed.breakEvenSellPrice)}
              {scenarioMode !== "SELL_PRICE" && computed.targetSellPrice > 0 ? ` | Target sell price: ${formatMoney(computed.targetSellPrice)}` : ""}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

