import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import type { User } from "../types";
import * as authApi from "../api/auth";
import client from "../api/client";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
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
  const [token, setToken] = useState<string | null>(localStorage.getItem("access_token"));
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const REFRESH_THRESHOLD_SEC = 86400; // 1 day — must match backend REFRESH_THRESHOLD_MINUTES

  const scheduleRefresh = (exp: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);

    const now = Math.floor(Date.now() / 1000);
    const remaining = exp - now;

    if (remaining <= 0) return; // already expired

    if (remaining <= REFRESH_THRESHOLD_SEC) {
      // Token is within the eligible refresh window — refresh now
      refreshTimer.current = setTimeout(doRefresh, 0);
    } else {
      // Token has plenty of life — schedule refresh when it enters the window
      const msUntilWindow = (remaining - REFRESH_THRESHOLD_SEC) * 1000;
      refreshTimer.current = setTimeout(doRefresh, msUntilWindow);
    }
  };

  const doRefresh = async () => {
    try {
      const { data } = await client.get("/auth/token/refresh");
      localStorage.setItem("access_token", data.access_token);
      setToken(data.access_token);
    } catch {
      // refresh failed — tokens will expire naturally, interceptor handles 401s
    }
  };

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
    localStorage.setItem("access_token", newToken);
    setToken(newToken);
  };

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setTokenAndSchedule(res.access_token);
  };

  const register = async (email: string, password: string) => {
    await authApi.register(email, password);
  };

  const oauthLogin = async (provider: "github", credential: string) => {
    const res = await authApi.oauthGithub(credential);
    setTokenAndSchedule(res.access_token);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
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
