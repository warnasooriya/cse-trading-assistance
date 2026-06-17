import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { fetchMarketWatch } from "../api/marketDataApi";

const sortOptions = [
  { value: "turnover", label: "Turnover" },
  { value: "changePercentage", label: "Change %" },
  { value: "sharevolume", label: "Share Volume" },
  { value: "marketCap", label: "Market Cap" },
  { value: "price", label: "Price" },
  { value: "symbol", label: "Symbol" },
  { value: "name", label: "Company Name" }
] as const;

function formatNumber(value: number | null, digits = 2) {
  return typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
}

export function MarketWatchPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]["value"]>("turnover");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const watchQuery = useQuery({
    queryKey: ["market", "watch", query, sortBy, sortDir],
    queryFn: () => fetchMarketWatch({ q: query || undefined, sortBy, sortDir, limit: 300, offset: 0 }),
    refetchInterval: 30_000
  });

  const summary = useMemo(() => {
    const items = watchQuery.data?.items ?? [];
    const advancers = items.filter((item) => (item.changePercentage ?? 0) > 0).length;
    const decliners = items.filter((item) => (item.changePercentage ?? 0) < 0).length;
    return { advancers, decliners };
  }, [watchQuery.data]);

  if (watchQuery.isLoading) {
    return (
      <Stack direction="row" alignItems="center" gap={2}>
        <CircularProgress size={20} />
        <Typography>Loading full market watch...</Typography>
      </Stack>
    );
  }

  if (watchQuery.error || !watchQuery.data) {
    return <Alert severity="error">{(watchQuery.error as Error)?.message ?? "Failed to load market watch"}</Alert>;
  }

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "center" }} gap={2}>
        <Box>
          <Typography variant="h4">Full Market Watch</Typography>
          <Typography color="text.secondary">
            Live CSE trade summary across {watchQuery.data.total.toLocaleString()} counters with search, sorting, and drill-down.
          </Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Chip label={`Advancers ${summary.advancers}`} color="success" />
          <Chip label={`Decliners ${summary.decliners}`} color="error" />
          <Chip label={`Updated ${new Date().toLocaleTimeString()}`} variant="outlined" />
        </Stack>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", xl: "row" }} gap={2}>
            <TextField
              label="Search Symbol or Company"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setQuery(searchInput.trim());
              }}
              fullWidth
            />
            <TextField select label="Sort By" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} sx={{ minWidth: 220 }}>
              {sortOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Direction" value={sortDir} onChange={(event) => setSortDir(event.target.value as "asc" | "desc")} sx={{ minWidth: 160 }}>
              <MenuItem value="desc">Descending</MenuItem>
              <MenuItem value="asc">Ascending</MenuItem>
            </TextField>
            <Button variant="contained" onClick={() => setQuery(searchInput.trim())}>
              Apply
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                setSearchInput("");
                setQuery("");
                setSortBy("turnover");
                setSortDir("desc");
              }}
            >
              Reset
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Market Watch Table</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Full market feed from the CSE `tradeSummary` endpoint. Click any symbol to open detailed analysis.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 920 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Change</TableCell>
                  <TableCell align="right">Change %</TableCell>
                  <TableCell align="right">Volume</TableCell>
                  <TableCell align="right">Turnover</TableCell>
                  <TableCell align="right">Market Cap</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {watchQuery.data.items.map((item) => (
                  <TableRow key={`${item.symbol}-${item.id ?? item.symbol}`}>
                    <TableCell>
                      <Typography variant="subtitle2">{item.symbol}</Typography>
                    </TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell align="right">{formatNumber(item.price)}</TableCell>
                    <TableCell align="right" sx={{ color: (item.change ?? 0) >= 0 ? "success.main" : "error.main" }}>
                      {formatNumber(item.change)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: (item.changePercentage ?? 0) >= 0 ? "success.main" : "error.main" }}>
                      {formatNumber(item.changePercentage)}%
                    </TableCell>
                    <TableCell align="right">{formatNumber(item.sharevolume, 0)}</TableCell>
                    <TableCell align="right">{formatNumber(item.turnover)}</TableCell>
                    <TableCell align="right">{formatNumber(item.marketCap)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => navigate(`/stocks?symbol=${encodeURIComponent(item.symbol)}`)}>
                        Analyze
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
