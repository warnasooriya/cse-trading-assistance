import type { ReactNode } from "react";
import { Alert, Button, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ feature, children }: { feature: string; children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <Stack direction="row" alignItems="center" gap={1} sx={{ py: 3 }}>
        <CircularProgress size={18} />
        <Typography color="text.secondary">Loading...</Typography>
      </Stack>
    );
  }

  if (state.status === "authenticated") {
    return <>{children}</>;
  }

  const next = `${location.pathname}${location.search}`;
  const params = new URLSearchParams();
  params.set("next", next);

  return (
    <Stack alignItems="center" sx={{ py: { xs: 2, md: 6 } }}>
      <Card sx={{ width: "100%", maxWidth: 720 }}>
        <CardContent>
          <Typography variant="h5">Login required</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            You need to sign in to access {feature}.
          </Typography>
          <Alert severity="info" sx={{ mt: 2 }}>
            Sign in to save your watchlists, portfolio settings, and personalized trade ideas.
          </Alert>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} sx={{ mt: 3 }}>
            <Button variant="contained" component={RouterLink} to={`/login?${params.toString()}`}>
              Sign In
            </Button>
            <Button variant="outlined" component={RouterLink} to={`/register?${params.toString()}`}>
              Create Account
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

