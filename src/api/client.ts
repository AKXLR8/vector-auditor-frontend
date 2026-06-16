import axios, { AxiosError } from "axios";
import { getApiBaseUrl } from "./config";

export const TOKEN_KEY = "access_token";
export const USER_KEY = "user";
export const DISPLAY_NAME_KEY = "user_display_name";

const client = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
  timeout: 180000,
});

let isRefreshing = false;
let lastRefreshAt = 0;
const REFRESH_COOLDOWN_MS = 20_000;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  pendingQueue = [];
}

function performHardLogout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* noop */
  }
  if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
    const target = "/login?expired=1";
    window.location.replace(target);
  }
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const originalRequest = err.config as any;

    if (err.response?.status === 401 && !originalRequest?._retry) {
      if (originalRequest?.url === "/auth/token/refresh") {
        performHardLogout();
        return Promise.reject(err);
      }

      const now = Date.now();
      if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            pendingQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest._retry = true;
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return client(originalRequest);
          });
        }
        performHardLogout();
        return Promise.reject(err);
      }
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest._retry = true;
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      lastRefreshAt = now;
      try {
        const { data } = await axios.get(`${getApiBaseUrl()}/auth/token/refresh`, {
          headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
        });
        localStorage.setItem(TOKEN_KEY, data.access_token);
        processQueue(null, data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        performHardLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export default client;

export async function retry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 400): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as any)?.response?.status;
      const retryable = status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600);
      if (!retryable || i === attempts - 1) break;
      const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
