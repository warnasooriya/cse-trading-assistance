import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const params = new URLSearchParams(location.search);
  const next = params.get("next");

  const mutation = useMutation({
    mutationFn: async () => {
      if (password !== confirm) throw new Error("Passwords do not match");
      await register({ email, password, displayName: displayName.trim() || undefined });
    },
    onSuccess: () => navigate(next || "/", { replace: true })
  });

  return (
    <Stack alignItems="center" sx={{ py: { xs: 2, md: 6 } }}>
      <Card sx={{ width: "100%", maxWidth: 520 }}>
        <CardContent>
          <Typography variant="h5">Create Account</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Create a profile to save watchlists, alerts, and portfolio settings.
          </Typography>

          {mutation.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(mutation.error as Error).message}
            </Alert>
          )}

          <Stack gap={2} sx={{ mt: 3 }}>
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" fullWidth />
            <TextField label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth />
            <TextField
              label="Password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              fullWidth
            />
            <TextField
              label="Confirm Password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              autoComplete="new-password"
              fullWidth
            />
            <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?{" "}
              <Button component={RouterLink} to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} size="small">
                Sign in
              </Button>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
