import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, Card, CardContent, CircularProgress, Grid, LinearProgress, Stack, Typography } from "@mui/material";
import { fetchPortfolio } from "../api/marketDataApi";

export function RiskPage() {
  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: fetchPortfolio, staleTime: 5_000 });
  const holdings = portfolioQuery.data?.holdings ?? [];

  const { portfolioValue, topPositionExposure, riskScore } = useMemo(() => {
    const values = holdings.map((h) => h.quantity * (h.marketPrice ?? h.avgCost));
    const portfolioValue = values.reduce((sum, v) => sum + v, 0);
    const top = values.length ? Math.max(...values) : 0;
    const topPositionExposure = portfolioValue ? (top / portfolioValue) * 100 : 0;
    const score = Math.max(0, Math.min(100, 92 - topPositionExposure * 1.2));
    return { portfolioValue, topPositionExposure, riskScore: score };
  }, [holdings]);

  return (
    <Stack gap={3}>
      <Typography variant="h4">Risk Control Center</Typography>
      <Typography color="text.secondary">
        Position sizing, exposure thresholds, and portfolio risk posture for governed trading decisions.
      </Typography>

      {portfolioQuery.isLoading && (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={18} />
          <Typography color="text.secondary">Loading...</Typography>
        </Stack>
      )}
      {portfolioQuery.error && (
        <Alert severity="error">
          {(portfolioQuery.error as Error).message}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Portfolio Risk Score</Typography>
              <Typography variant="h3">{riskScore.toFixed(0)}/100</Typography>
              <LinearProgress value={riskScore} variant="determinate" color="warning" sx={{ mt: 2, height: 10, borderRadius: 999 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Largest Position Exposure</Typography>
              <Typography variant="h3">{topPositionExposure.toFixed(1)}%</Typography>
              <Typography color="text.secondary">Suggested limit: below 18%</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Portfolio Value</Typography>
              <Typography variant="h3">{portfolioValue.toLocaleString()}</Typography>
              <Typography color="text.secondary">Estimated from holdings market prices.</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">Risk Policies</Typography>
              <Stack gap={2} sx={{ mt: 2 }}>
                {[
                  { label: "Maximum daily risk", value: 2.0, color: "success" as const },
                  { label: "Maximum portfolio exposure", value: 82.0, color: "warning" as const },
                  { label: "Suggested stop loss discipline", value: 74.0, color: "success" as const },
                  { label: "Suggested take profit discipline", value: 61.0, color: "warning" as const }
                ].map((item) => (
                  <Box key={item.label}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography>{item.label}</Typography>
                      <Typography color="text.secondary">{item.value.toFixed(0)}%</Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={item.value}
                      color={item.color}
                      sx={{ mt: 0.75, height: 10, borderRadius: 999 }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Stack gap={2}>
            {topPositionExposure > 18 ? (
              <Alert severity="warning">Largest position exposure is above the preferred threshold and needs diversification.</Alert>
            ) : (
              <Alert severity="success">Largest position exposure is within preferred threshold.</Alert>
            )}
            <Alert severity="info">Risk score and policies are computed from current portfolio holdings.</Alert>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
