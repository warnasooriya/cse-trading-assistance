import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../auth/AuthProvider";

export function ProfilePage() {
  const { state, saveProfile, refresh, logout } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en");

  useEffect(() => {
    if (state.status === "authenticated") {
      setDisplayName(state.user.displayName ?? "");
      setPreferredLanguage(state.user.preferredLanguage ?? "en");
    }
  }, [state]);

  const mutation = useMutation({
    mutationFn: () => saveProfile({ displayName: displayName.trim() || undefined, preferredLanguage }),
    onSuccess: () => refresh()
  });

  if (state.status !== "authenticated") {
    return (
      <Alert severity="warning">
        Please sign in to manage your profile.
      </Alert>
    );
  }

  return (
    <Stack gap={3}>
      <Typography variant="h4">Profile</Typography>
      <Typography color="text.secondary">Manage your account settings.</Typography>

      <Card>
        <CardContent>
          <Stack gap={2}>
            {mutation.error && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
            <TextField label="Email" value={state.user.email ?? ""} fullWidth disabled />
            <TextField label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth />
            <TextField
              select
              label="Preferred Language"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              fullWidth
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="si">සිංහල</MenuItem>
              <MenuItem value="ta">தமிழ்</MenuItem>
            </TextField>
            <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
              <Button variant="contained" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outlined" color="error" onClick={logout}>
                Sign Out
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

