import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useLocation } from "react-router-dom";
import {
  createAlert,
  deleteAlert,
  evaluateAlerts,
  fetchAlertDeliveries,
  fetchAlerts,
  updateAlertStatus,
  type AlertsApiItem
} from "../api/marketDataApi";
import { useI18n } from "../i18n/I18nProvider";

export function AlertsPage() {
  const location = useLocation();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(location.search.includes("create"));
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<{
    type: AlertsApiItem["type"];
    symbol: string;
    channel: AlertsApiItem["channel"];
    trigger: string;
    destination: string;
  }>({
    type: "AI Buy Signal",
    symbol: "JKH.N0000",
    channel: "Push",
    trigger: "Confidence above 80%",
    destination: ""
  });

  const channelOptions = useMemo(
    () => [
      { value: "Email", label: t("alerts.channelEmail") },
      { value: "SMS", label: t("alerts.channelSms") },
      { value: "Push", label: t("alerts.channelPush") }
    ],
    [t]
  );

  const alertsQuery = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    staleTime: 5_000
  });

  const deliveriesQuery = useQuery({
    queryKey: ["alerts", "deliveries"],
    queryFn: fetchAlertDeliveries,
    staleTime: 5_000
  });

  const createMutation = useMutation({
    mutationFn: () => createAlert(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setSaved(true);
      setShowForm(false);
    }
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { id: string; status: "Active" | "Paused" }) => updateAlertStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAlert(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  });

  const evaluateMutation = useMutation({
    mutationFn: evaluateAlerts,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["alerts", "deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  });

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }}>
        <div>
          <Typography variant="h4">{t("alerts.title")}</Typography>
          <Typography color="text.secondary">
            {t("alerts.subtitle")}
          </Typography>
        </div>
        <Button variant="contained" onClick={() => setShowForm((current) => !current)}>
          {t("alerts.createRule")}
        </Button>
      </Stack>

      {saved && <Alert severity="success">{t("alerts.ruleCreated")}</Alert>}

      {showForm && (
        <Card>
          <CardContent>
            <Typography variant="h6">{t("alerts.formTitle")}</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              {t("alerts.formSubtitle")}
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              <TextField
                select
                label={t("common.type")}
                value={draft.type}
                onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as AlertsApiItem["type"] }))}
                fullWidth
              >
                {["AI Buy Signal", "AI Sell Signal", "Price Breakout", "RSI Oversold", "RSI Overbought", "Volume Spike"].map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t("common.symbol")}
                value={draft.symbol}
                onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))}
                fullWidth
              />
              <TextField
                select
                label={t("common.channel")}
                value={draft.channel}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, channel: event.target.value as AlertsApiItem["channel"] }))
                }
                fullWidth
              >
                {channelOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t("common.trigger")}
                value={draft.trigger}
                onChange={(event) => setDraft((current) => ({ ...current, trigger: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Destination"
                value={draft.destination}
                onChange={(event) => setDraft((current) => ({ ...current, destination: event.target.value }))}
                fullWidth
                placeholder={draft.channel === "Email" ? "user@example.com" : draft.channel === "SMS" ? "+94770000000" : "Browser / device destination"}
              />
            </Stack>
            <Stack direction="row" gap={1.5} sx={{ mt: 2 }}>
              <Button variant="contained" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
              <Button variant="outlined" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap={1.5}>
            <Typography variant="h6">{t("alerts.configuredAlerts")}</Typography>
            <Button variant="outlined" onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
              {evaluateMutation.isPending ? "Checking..." : "Run Delivery Check"}
            </Button>
          </Stack>
          {evaluateMutation.data && (
            <Alert severity={evaluateMutation.data.deliveries.length > 0 ? "success" : "info"} sx={{ mt: 2 }}>
              Evaluated {evaluateMutation.data.evaluated} rules. Delivered {evaluateMutation.data.deliveries.length} notification(s).
            </Alert>
          )}
          {alertsQuery.isLoading && (
            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 2 }}>
              <CircularProgress size={18} />
              <Typography color="text.secondary">{t("common.loading")}</Typography>
            </Stack>
          )}
          {alertsQuery.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(alertsQuery.error as Error).message}
            </Alert>
          )}
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ mt: 2, minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("common.type")}</TableCell>
                  <TableCell>{t("common.symbol")}</TableCell>
                  <TableCell>{t("common.channel")}</TableCell>
                  <TableCell>{t("common.trigger")}</TableCell>
                  <TableCell>{t("common.status")}</TableCell>
                  <TableCell align="right">{t("common.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(alertsQuery.data ?? []).map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>{alert.type}</TableCell>
                    <TableCell>{alert.symbol}</TableCell>
                    <TableCell>{channelOptions.find((option) => option.value === alert.channel)?.label ?? alert.channel}</TableCell>
                    <TableCell>{alert.trigger}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={alert.status === "Active" ? t("common.active") : t("common.paused")}
                        color={alert.status === "Active" ? "success" : "warning"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" justifyContent="flex-end" gap={1}>
                        <Button
                          size="small"
                          variant="text"
                          disabled={toggleMutation.isPending}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: alert.id,
                              status: alert.status === "Active" ? "Paused" : "Active"
                            })
                          }
                        >
                          {alert.status === "Active" ? t("alerts.pause") : t("alerts.activate")}
                        </Button>
                        <Button size="small" color="error" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(alert.id)}>
                          {t("common.delete")}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Recent Alert Deliveries</Typography>
          {deliveriesQuery.isLoading && (
            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 2 }}>
              <CircularProgress size={18} />
              <Typography color="text.secondary">{t("common.loading")}</Typography>
            </Stack>
          )}
          {deliveriesQuery.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(deliveriesQuery.error as Error).message}
            </Alert>
          )}
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ mt: 2, minWidth: 920 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("common.type")}</TableCell>
                  <TableCell>{t("common.symbol")}</TableCell>
                  <TableCell>{t("common.channel")}</TableCell>
                  <TableCell>Destination</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Triggered</TableCell>
                  <TableCell>Message</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(deliveriesQuery.data ?? []).map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>{delivery.type}</TableCell>
                    <TableCell>{delivery.symbol}</TableCell>
                    <TableCell>{delivery.channel}</TableCell>
                    <TableCell>{delivery.destination || "Auto"}</TableCell>
                    <TableCell>{delivery.status}</TableCell>
                    <TableCell>{delivery.provider}</TableCell>
                    <TableCell>{new Date(delivery.triggeredAt).toLocaleString()}</TableCell>
                    <TableCell>{delivery.message}</TableCell>
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
