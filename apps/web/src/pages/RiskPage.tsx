import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  LinearProgress,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  fetchRiskEvents,
  fetchRiskStatus,
  resetRiskKillSwitch,
  updateRiskLimits,
  type RiskLimits
} from "../api/marketDataApi";

type LimitsDraft = {
  maxPositionPctOfPortfolio: string;
  maxPortfolioExposurePct: string;
  maxDailyLossPct: string;
  maxOpenPositions: string;
  defaultStopLossPct: string;
  defaultTakeProfitPct: string;
};

function toDraft(limits: RiskLimits): LimitsDraft {
  return {
    maxPositionPctOfPortfolio: String(limits.maxPositionPctOfPortfolio),
    maxPortfolioExposurePct: String(limits.maxPortfolioExposurePct),
    maxDailyLossPct: String(limits.maxDailyLossPct),
    maxOpenPositions: String(limits.maxOpenPositions),
    defaultStopLossPct: String(limits.defaultStopLossPct),
    defaultTakeProfitPct: String(limits.defaultTakeProfitPct)
  };
}

export function RiskPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LimitsDraft | null>(null);
  const [saved, setSaved] = useState(false);

  const statusQuery = useQuery({ queryKey: ["risk", "status"], queryFn: fetchRiskStatus, staleTime: 5_000 });
  const eventsQuery = useQuery({ queryKey: ["risk", "events"], queryFn: fetchRiskEvents, staleTime: 5_000 });

  useEffect(() => {
    if (statusQuery.data && !draft) {
      setDraft(toDraft(statusQuery.data.limits));
    }
  }, [statusQuery.data, draft]);

  const saveMutation = useMutation({
    mutationFn: (payload: LimitsDraft) =>
      updateRiskLimits({
        maxPositionPctOfPortfolio: Number(payload.maxPositionPctOfPortfolio),
        maxPortfolioExposurePct: Number(payload.maxPortfolioExposurePct),
        maxDailyLossPct: Number(payload.maxDailyLossPct),
        maxOpenPositions: Number(payload.maxOpenPositions),
        defaultStopLossPct: Number(payload.defaultStopLossPct),
        defaultTakeProfitPct: Number(payload.defaultTakeProfitPct)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["risk"] });
      setSaved(true);
    }
  });

  const resetMutation = useMutation({
    mutationFn: resetRiskKillSwitch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["risk"] });
    }
  });

  const status = statusQuery.data;
  const limits = status?.limits;

  return (
    <Stack gap={3}>
      <Typography variant="h4">Risk Control Center</Typography>
      <Typography color="text.secondary">
        Position sizing, exposure thresholds, and a daily-loss kill switch that gates every order placed through the broker API.
      </Typography>

      {statusQuery.isLoading && (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={18} />
          <Typography color="text.secondary">Loading...</Typography>
        </Stack>
      )}
      {statusQuery.error && <Alert severity="error">{(statusQuery.error as Error).message}</Alert>}

      {limits?.tradingHalted && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
              Resume trading
            </Button>
          }
        >
          Trading halted: {limits.tradingHaltedReason}
        </Alert>
      )}

      {status && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">Portfolio Value</Typography>
                <Typography variant="h4">{status.portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">Portfolio Exposure</Typography>
                <Typography variant="h4">{status.exposurePct.toFixed(1)}%</Typography>
                <Typography color="text.secondary">Cap: {limits?.maxPortfolioExposurePct}%</Typography>
                <LinearProgress
                  value={Math.min(100, status.exposurePct)}
                  variant="determinate"
                  color={status.exposurePct > (limits?.maxPortfolioExposurePct ?? 100) ? "error" : "success"}
                  sx={{ mt: 1, height: 8, borderRadius: 999 }}
                />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">Largest Position</Typography>
                <Typography variant="h4">{status.largestPositionPct.toFixed(1)}%</Typography>
                <Typography color="text.secondary">Cap: {limits?.maxPositionPctOfPortfolio}%</Typography>
                <LinearProgress
                  value={Math.min(100, status.largestPositionPct)}
                  variant="determinate"
                  color={status.largestPositionPct > (limits?.maxPositionPctOfPortfolio ?? 100) ? "error" : "success"}
                  sx={{ mt: 1, height: 8, borderRadius: 999 }}
                />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">Today's P&amp;L</Typography>
                <Typography variant="h4" color={status.dailyPnlPct < 0 ? "error.main" : "success.main"}>
                  {status.dailyPnlPct >= 0 ? "+" : ""}
                  {status.dailyPnlPct.toFixed(2)}%
                </Typography>
                <Typography color="text.secondary">Kill switch at -{limits?.maxDailyLossPct}%</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">Risk Limits</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                These caps are enforced server-side before any order (paper or linked broker) is executed.
              </Typography>
              {saved && <Alert severity="success" sx={{ mb: 2 }}>Limits updated.</Alert>}
              {draft && (
                <Stack gap={2}>
                  <TextField
                    label="Max position size (% of portfolio)"
                    type="number"
                    value={draft.maxPositionPctOfPortfolio}
                    onChange={(e) => setDraft({ ...draft, maxPositionPctOfPortfolio: e.target.value })}
                  />
                  <TextField
                    label="Max portfolio exposure (%)"
                    type="number"
                    value={draft.maxPortfolioExposurePct}
                    onChange={(e) => setDraft({ ...draft, maxPortfolioExposurePct: e.target.value })}
                  />
                  <TextField
                    label="Max daily loss before kill switch (%)"
                    type="number"
                    value={draft.maxDailyLossPct}
                    onChange={(e) => setDraft({ ...draft, maxDailyLossPct: e.target.value })}
                  />
                  <TextField
                    label="Max open positions"
                    type="number"
                    value={draft.maxOpenPositions}
                    onChange={(e) => setDraft({ ...draft, maxOpenPositions: e.target.value })}
                  />
                  <TextField
                    label="Default stop loss (%)"
                    type="number"
                    value={draft.defaultStopLossPct}
                    onChange={(e) => setDraft({ ...draft, defaultStopLossPct: e.target.value })}
                  />
                  <TextField
                    label="Default take profit (%)"
                    type="number"
                    value={draft.defaultTakeProfitPct}
                    onChange={(e) => setDraft({ ...draft, defaultTakeProfitPct: e.target.value })}
                  />
                  <Box>
                    <Button
                      variant="contained"
                      onClick={() => draft && saveMutation.mutate(draft)}
                      disabled={saveMutation.isPending}
                    >
                      Save limits
                    </Button>
                  </Box>
                  {saveMutation.error && <Alert severity="error">{(saveMutation.error as Error).message}</Alert>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">Recent Risk Events</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Blocked orders, kill-switch triggers, and manual overrides.
              </Typography>
              <Stack gap={1.5}>
                {(eventsQuery.data ?? []).length === 0 && (
                  <Typography color="text.secondary">No risk events yet.</Typography>
                )}
                {(eventsQuery.data ?? []).map((event) => (
                  <Alert key={event.id} severity={event.event_type === "MANUAL_OVERRIDE" ? "info" : "warning"}>
                    <strong>{event.event_type}</strong>
                    {event.symbol ? ` — ${event.symbol}` : ""}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {new Date(event.created_at).toLocaleString()}
                    </Typography>
                  </Alert>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
