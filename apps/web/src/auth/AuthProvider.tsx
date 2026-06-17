import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, loginUser, registerUser, updateProfile, type AuthUser } from "../api/marketDataApi";

type AuthState =
  | { status: "loading"; token: string | null; user: AuthUser | null }
  | { status: "authenticated"; token: string; user: AuthUser }
  | { status: "anonymous"; token: null; user: null };

type AuthContextValue = {
  state: AuthState;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: { email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  saveProfile: (payload: { displayName?: string; preferredLanguage?: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(): string | null {
  try {
    return localStorage.getItem("cse_ai_token");
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem("cse_ai_token");
    else localStorage.setItem("cse_ai_token", token);
  } catch {
    return;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({ status: "loading", token: readToken(), user: null }));

  const refresh = async () => {
    const token = readToken();
    if (!token) {
      setState({ status: "anonymous", token: null, user: null });
      return;
    }

    setState((current) => ({ status: "loading", token: current.token ?? token, user: current.user ?? null }));
    try {
      const user = await fetchMe();
      setState({ status: "authenticated", token, user });
    } catch {
      writeToken(null);
      setState({ status: "anonymous", token: null, user: null });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const login = async (payload: { email: string; password: string }) => {
    const res = await loginUser(payload);
    writeToken(res.token);
    setState({ status: "authenticated", token: res.token, user: res.user });
  };

  const register = async (payload: { email: string; password: string; displayName?: string }) => {
    const res = await registerUser(payload);
    writeToken(res.token);
    setState({ status: "authenticated", token: res.token, user: res.user });
  };

  const logout = () => {
    writeToken(null);
    setState({ status: "anonymous", token: null, user: null });
  };

  const saveProfile = async (payload: { displayName?: string; preferredLanguage?: string }) => {
    if (state.status !== "authenticated") throw new Error("Not authenticated");
    const user = await updateProfile(payload);
    setState({ status: "authenticated", token: state.token, user });
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login,
      register,
      logout,
      refresh,
      saveProfile
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("AuthProvider is missing");
  }
  return ctx;
}

