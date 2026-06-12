import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import type { User } from "../types";
import * as authApi from "../api/auth";
import client, { TOKEN_KEY, DISPLAY_NAME_KEY } from "../api/client";

const USERNAME_KEY = "user_username";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
  oauthLogin: (provider: "github", credential: string) => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseToken(token: string): {
  sub: string;
  roles: string[];
  exp: number;
  display_name?: string | null;
  preferred_username?: string | null;
} | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      sub: payload.sub,
      roles: payload.roles || [],
      exp: payload.exp,
      display_name: payload.display_name || payload.name || null,
      preferred_username: payload.preferred_username || null,
    };
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
  const MIN_REFRESH_DELAY_MS = 10_000;

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

    let delayMs: number;
    if (remaining <= REFRESH_THRESHOLD_SEC) {
      delayMs = 0;
    } else {
      delayMs = (remaining - REFRESH_THRESHOLD_SEC) * 1000;
    }

    if (delayMs < MIN_REFRESH_DELAY_MS) delayMs = MIN_REFRESH_DELAY_MS;

    refreshTimer.current = setTimeout(doRefresh, delayMs);
  };

  const doRefresh = async () => {
    if (loggingOutRef.current) return;
    try {
      const { data } = await client.get("/auth/token/refresh");
      if (loggingOutRef.current) return;
      loggingOutRef.current = false;
      localStorage.setItem(TOKEN_KEY, data.access_token);
      if (data.display_name) localStorage.setItem(DISPLAY_NAME_KEY, data.display_name);
      if (data.username) localStorage.setItem(USERNAME_KEY, data.username);
      setToken(data.access_token);
      expiryWarningShown.current = false;
    } catch {
      if (loggingOutRef.current) return;
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
        const cachedName = localStorage.getItem(DISPLAY_NAME_KEY);
        const cachedUsername = localStorage.getItem(USERNAME_KEY);
        const isUuid = (s: string) => /^[0-9a-f]{32}$/i.test(s);
        const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
        const subName = isUuid(parsed.sub) ? null : parsed.sub;
        const preferredName = parsed.preferred_username && !isUuid(parsed.preferred_username) && !isEmail(parsed.preferred_username) ? parsed.preferred_username : null;
        const display_name = cachedName || parsed.display_name || preferredName || subName || null;
        const username = cachedUsername || preferredName || null;
        const email = !isUuid(parsed.sub) ? parsed.sub : null;
        setUser({
          id: parsed.sub,
          email: email || parsed.sub,
          display_name,
          username,
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

  const setTokenAndSchedule = (newToken: string, extra?: { username?: string | null; display_name?: string | null }) => {
    loggingOutRef.current = false;
    localStorage.setItem(TOKEN_KEY, newToken);
    if (extra?.display_name) localStorage.setItem(DISPLAY_NAME_KEY, extra.display_name);
    if (extra?.username) localStorage.setItem(USERNAME_KEY, extra.username);
    setToken(newToken);
    expiryWarningShown.current = false;
  };

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setTokenAndSchedule(res.access_token, { username: res.username, display_name: res.display_name });
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string, username?: string) => {
    await authApi.register(email, password, firstName, lastName, username);
  };

  const oauthLogin = async (provider: "github", credential: string) => {
    const res = await authApi.oauthGithub(credential);
    setTokenAndSchedule(res.access_token, { username: res.username, display_name: res.display_name });
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
      localStorage.removeItem(DISPLAY_NAME_KEY);
      localStorage.removeItem(USERNAME_KEY);
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
