import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import type { User } from "../types";
import * as authApi from "../api/auth";
import client, { TOKEN_KEY, USER_KEY } from "../api/client";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => Promise<void>;
  oauthLogin: (provider: "github", credential: string) => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseToken(token: string): { sub: string; roles: string[]; exp: number; display_name?: string | null } | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { sub: payload.sub, roles: payload.roles || [], exp: payload.exp, display_name: payload.display_name || null };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryWarningShown = useRef(false);
  const loggingOutRef = useRef(false);

  const REFRESH_THRESHOLD_SEC = 86400; // 1 day — must match backend REFRESH_THRESHOLD_MINUTES

  const scheduleRefresh = (exp: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);

    const now = Math.floor(Date.now() / 1000);
    const remaining = exp - now;

    if (remaining <= 0) return;

    const EXPIRY_WARN_SEC = 300;
    if (remaining <= EXPIRY_WARN_SEC && remaining > REFRESH_THRESHOLD_SEC) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("va:trigger-expiry-warning"));
      }, (remaining - REFRESH_THRESHOLD_SEC) * 1000);
    }

    if (remaining <= REFRESH_THRESHOLD_SEC) {
      refreshTimer.current = setTimeout(doRefresh, 0);
    } else {
      const msUntilWindow = (remaining - REFRESH_THRESHOLD_SEC) * 1000;
      refreshTimer.current = setTimeout(doRefresh, msUntilWindow);
    }
  };

  const doRefresh = async () => {
    if (loggingOutRef.current) return;
    try {
      const { data } = await client.get("/auth/token/refresh");
      if (loggingOutRef.current) return;
      loggingOutRef.current = false;
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
      expiryWarningShown.current = false;
    } catch {
      if (loggingOutRef.current) return;
      // refresh failed — tokens will expire naturally, interceptor handles 401s
    }
  };

  const showExpiryWarning = () => {
    if (expiryWarningShown.current) return;
    expiryWarningShown.current = true;
    window.dispatchEvent(new CustomEvent("va:session-expiring"));
  };

  useEffect(() => {
    const onWarning = () => showExpiryWarning();
    window.addEventListener("va:trigger-expiry-warning", onWarning);
    return () => window.removeEventListener("va:trigger-expiry-warning", onWarning);
  }, []);

  useEffect(() => {
    if (token) {
      const parsed = parseToken(token);
      if (parsed) {
        setUser({
          id: parsed.sub,
          email: parsed.sub,
          display_name: parsed.display_name || null,
          roles: parsed.roles,
          mfa_enabled: false,
          created_at: new Date().toISOString(),
        } as User);
        scheduleRefresh(parsed.exp);
      }
    }
    setLoading(false);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [token]);

  const setTokenAndSchedule = (newToken: string) => {
    loggingOutRef.current = false;
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    expiryWarningShown.current = false;
  };

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setTokenAndSchedule(res.access_token);
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    await authApi.register(email, password, firstName, lastName);
  };

  const oauthLogin = async (provider: "github", credential: string) => {
    const res = await authApi.oauthGithub(credential);
    setTokenAndSchedule(res.access_token);
  };

  const logout = async () => {
    loggingOutRef.current = true;
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    if (loggingOutRef.current) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
      try {
        window.sessionStorage.setItem("va:logged-out", "1");
      } catch {
        /* ignore */
      }
    }
  };

  const isAuthenticated = !!token;
  const isAdmin = user?.roles?.includes("admin") ?? false;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, oauthLogin, logout, isAuthenticated, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
