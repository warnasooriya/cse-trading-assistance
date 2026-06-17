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
  Divider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { fetchMarketNews, fetchSuggestions, type SuggestionItem } from "../api/marketDataApi";

function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits });
}

function SuggestionCard({ item }: { item: SuggestionItem }) {
  const navigate = useNavigate();
  const color = item.action === "BUY" ? "success" : item.action === "SELL" ? "error" : "default";
  const change = item.facts.changePercentage;

  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="h6">{item.symbol}</Typography>
              <Chip size="small" color={color as any} label={item.action} />
              <Chip size="small" variant="outlined" label={`Confidence ${item.confidence.toFixed(0)}%`} />
              <Chip
                size="small"
                variant="outlined"
                label={typeof change === "number" ? `${change.toFixed(2)}%` : "—"}
                color={typeof change === "number" && change < 0 ? "error" : "success"}
              />
            </Stack>
            <Typography color="text.secondary">{item.name}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center" justifyContent={{ xs: "flex-start", md: "flex-end" }} flexWrap="wrap">
            <Button variant="contained" onClick={() => navigate(`/stocks?symbol=${encodeURIComponent(item.symbol)}`)}>
              Analyze
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Stack direction={{ xs: "column", lg: "row" }} gap={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Explanations</Typography>
            <Stack gap={0.75} sx={{ mt: 1 }}>
              {item.reasons.slice(0, 6).map((reason, idx) => (
                <Typography key={`${item.symbol}-r-${idx}`} variant="body2" color="text.secondary">
                  {reason}
                </Typography>
              ))}
            </Stack>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Facts</Typography>
            <Stack gap={0.75} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Last Traded Price: {formatNumber(item.facts.lastTradedPrice)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Volume: {formatNumber(item.facts.volume, 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Turnover: {formatNumber(item.facts.turnover)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Market Cap: {formatNumber(item.facts.marketCap)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                52W Range: {formatNumber(item.facts.low52Week)} → {formatNumber(item.facts.high52Week)}
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function SuggestionsPage() {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [newsScope, setNewsScope] = useState<"local" | "world">("local");

  const suggestionsQuery = useQuery({
    queryKey: ["market", "suggestions"],
    queryFn: () => fetchSuggestions(12),
    refetchInterval: 60_000
  });

  const newsQuery = useQuery({
    queryKey: ["market", "news", newsScope],
    queryFn: () => fetchMarketNews({ scope: newsScope, limit: 10 }),
    refetchInterval: 120_000
  });

  const list = useMemo(() => {
    if (!suggestionsQuery.data) return [];
    return mode === "buy" ? suggestionsQuery.data.buy : suggestionsQuery.data.sell;
  }, [mode, suggestionsQuery.data]);

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap={2}>
        <Box>
          <Typography variant="h4">Trade Ideas (Buy/Sell)</Typography>
          <Typography color="text.secondary">
            Ranked buy/sell candidates with explanations and fact-based signals.
          </Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <ToggleButtonGroup
            exclusive
            value={mode}
            onChange={(_, value) => value && setMode(value)}
            size="small"
          >
            <ToggleButton value="buy">Buy</ToggleButton>
            <ToggleButton value="sell">Sell</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" onClick={() => suggestionsQuery.refetch()} disabled={suggestionsQuery.isFetching}>
            Refresh
          </Button>
        </Stack>
      </Stack>

      {suggestionsQuery.isLoading && (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={18} />
          <Typography color="text.secondary">Loading...</Typography>
        </Stack>
      )}
      {suggestionsQuery.error && <Alert severity="error">{(suggestionsQuery.error as Error).message}</Alert>}

      {suggestionsQuery.data && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Chip label={`Scanned: ${suggestionsQuery.data.scanned}`} variant="outlined" />
          <Chip label={`Buy: ${suggestionsQuery.data.buy.length}`} color="success" variant="outlined" />
          <Chip label={`Sell: ${suggestionsQuery.data.sell.length}`} color="error" variant="outlined" />
        </Stack>
      )}

      {list.length === 0 && suggestionsQuery.data && (
        <Typography color="text.secondary">No {mode.toUpperCase()} candidates matched the current model thresholds.</Typography>
      )}

      <Stack gap={2}>
        {list.map((item) => (
          <SuggestionCard key={`${item.symbol}-${item.action}`} item={item} />
        ))}
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap={2}>
            <Box>
              <Typography variant="h6">News (World + Local)</Typography>
              <Typography color="text.secondary">Latest headlines used as context for discretionary review.</Typography>
            </Box>
            <ToggleButtonGroup
              exclusive
              value={newsScope}
              onChange={(_, value) => value && setNewsScope(value)}
              size="small"
            >
              <ToggleButton value="local">Local</ToggleButton>
              <ToggleButton value="world">World</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {newsQuery.isLoading && (
            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 2 }}>
              <CircularProgress size={18} />
              <Typography color="text.secondary">Loading...</Typography>
            </Stack>
          )}
          {newsQuery.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(newsQuery.error as Error).message}
            </Alert>
          )}

          {newsQuery.data && (
            <Stack gap={1} sx={{ mt: 2 }}>
              {newsQuery.data.items.map((item) => (
                <Box key={item.link} sx={{ p: 1.5, borderRadius: 3, bgcolor: "rgba(255,255,255,0.02)" }}>
                  <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}>
                    <Box>
                      <Typography variant="subtitle2">{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.source ?? "News"} {item.pubDate ? `| ${item.pubDate}` : ""}
                      </Typography>
                    </Box>
                    <Button variant="outlined" component="a" href={item.link} target="_blank" rel="noreferrer">
                      Open Source
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

