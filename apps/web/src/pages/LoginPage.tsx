import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const params = new URLSearchParams(location.search);
  const next = params.get("next");

  const mutation = useMutation({
    mutationFn: () => login({ email, password }),
    onSuccess: () => navigate(next || "/", { replace: true })
  });

  return (
    <Stack alignItems="center" sx={{ py: { xs: 2, md: 6 } }}>
      <Card sx={{ width: "100%", maxWidth: 520 }}>
        <CardContent>
          <Typography variant="h5">Sign In</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Access your portfolios, alerts, and watchlists.
          </Typography>

          {mutation.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(mutation.error as Error).message}
            </Alert>
          )}

          <Stack gap={2} sx={{ mt: 3 }}>
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" fullWidth />
            <TextField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              fullWidth
            />
            <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Signing in..." : "Sign In"}
            </Button>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              New user?{" "}
              <Button component={RouterLink} to={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} size="small">
                Create account
              </Button>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
