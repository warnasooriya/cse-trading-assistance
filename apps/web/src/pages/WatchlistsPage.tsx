import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { addWatchlistItem, createWatchlist, deleteWatchlist, fetchMarketWatch, fetchWatchlists, removeWatchlistItem } from "../api/marketDataApi";
import type { MarketWatchItem, Watchlist } from "../api/marketDataApi";
import { useAuth } from "../auth/AuthProvider";

export function WatchlistsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state } = useAuth();

  const [newName, setNewName] = useState("");
  const [selectedList, setSelectedList] = useState<Watchlist | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<MarketWatchItem | null>(null);

  const listsQuery = useQuery({
    queryKey: ["watchlists"],
    queryFn: fetchWatchlists,
    staleTime: 5_000
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

  const createMutation = useMutation({
    mutationFn: () => createWatchlist(newName.trim()),
    onSuccess: async () => {
      setNewName("");
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWatchlist(id),
    onSuccess: async () => {
      setSelectedList(null);
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    }
  });

  const addItemMutation = useMutation({
    mutationFn: (payload: { watchlistId: string; symbol: string; name?: string }) =>
      addWatchlistItem(payload.watchlistId, { symbol: payload.symbol, name: payload.name }),
    onSuccess: async () => {
      setCompanySearch("");
      setSelectedCompany(null);
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    }
  });

  const removeItemMutation = useMutation({
    mutationFn: (payload: { watchlistId: string; symbol: string }) => removeWatchlistItem(payload.watchlistId, payload.symbol),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    }
  });

  const lists = listsQuery.data ?? [];

  const activeList = useMemo(() => {
    if (!lists.length) return null;
    if (selectedList) {
      const found = lists.find((l) => l.id === selectedList.id);
      return found ?? null;
    }
    return lists[0] ?? null;
  }, [lists, selectedList]);

  const companyOptions = companyLookupQuery.data?.items ?? [];

  if (state.status !== "authenticated") {
    return (
      <Alert severity="warning">
        Please sign in to use custom watchlists.
      </Alert>
    );
  }

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap={2}>
        <Box>
          <Typography variant="h4">Custom Watchlists</Typography>
          <Typography color="text.secondary">Create multiple lists and save symbols for quick monitoring.</Typography>
        </Box>
      </Stack>

      {listsQuery.isLoading && (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={18} />
          <Typography color="text.secondary">Loading...</Typography>
        </Stack>
      )}
      {listsQuery.error && <Alert severity="error">{(listsQuery.error as Error).message}</Alert>}

      <Card>
        <CardContent>
          <Typography variant="h6">Create Watchlist</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} sx={{ mt: 2 }}>
            <TextField label="Watchlist name" value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth />
            <Button variant="contained" disabled={createMutation.isPending || !newName.trim()} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Your Watchlists</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
            {lists.map((list) => (
              <Chip
                key={list.id}
                label={`${list.name} (${list.items.length})`}
                variant={activeList?.id === list.id ? "filled" : "outlined"}
                color={activeList?.id === list.id ? "primary" : "default"}
                onClick={() => setSelectedList(list)}
              />
            ))}
            {lists.length === 0 && <Typography color="text.secondary">No watchlists yet.</Typography>}
          </Stack>

          {activeList && (
            <>
              <Divider sx={{ my: 2 }} />
              <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", lg: "center" }} gap={2}>
                <Typography variant="subtitle1">{activeList.name}</Typography>
                <Button variant="outlined" color="error" onClick={() => deleteMutation.mutate(activeList.id)} disabled={deleteMutation.isPending}>
                  Delete Watchlist
                </Button>
              </Stack>

              <Stack direction={{ xs: "column", lg: "row" }} gap={2} sx={{ mt: 2 }}>
                <Autocomplete
                  fullWidth
                  options={companyOptions}
                  value={selectedCompany}
                  inputValue={companySearch}
                  onInputChange={(_, value) => setCompanySearch(value)}
                  onChange={(_, value) => setSelectedCompany(value)}
                  getOptionLabel={(option) => `${option.name} (${option.symbol})`}
                  renderInput={(params) => <TextField {...params} label="Add symbol" />}
                />
                <Button
                  variant="contained"
                  disabled={!selectedCompany || addItemMutation.isPending}
                  onClick={() =>
                    selectedCompany &&
                    addItemMutation.mutate({ watchlistId: activeList.id, symbol: selectedCompany.symbol, name: selectedCompany.name })
                  }
                >
                  {addItemMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </Stack>

              <Stack gap={1} sx={{ mt: 2 }}>
                {activeList.items.map((item) => (
                  <Box
                    key={`${activeList.id}-${item.symbol}`}
                    sx={{ p: 1.5, borderRadius: 3, bgcolor: "rgba(255,255,255,0.02)" }}
                  >
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1.5}>
                      <Box>
                        <Typography variant="subtitle2">{item.symbol}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.name}
                        </Typography>
                      </Box>
                      <Stack direction="row" gap={1}>
                        <Button variant="contained" size="small" onClick={() => navigate(`/stocks?symbol=${encodeURIComponent(item.symbol)}`)}>
                          Analyze
                        </Button>
                        <Button
                          color="error"
                          size="small"
                          disabled={removeItemMutation.isPending}
                          onClick={() => removeItemMutation.mutate({ watchlistId: activeList.id, symbol: item.symbol })}
                        >
                          Remove
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
                {activeList.items.length === 0 && <Typography color="text.secondary">No symbols in this watchlist.</Typography>}
              </Stack>
            </>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

