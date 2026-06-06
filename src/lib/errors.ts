export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
  isNetwork: boolean;
  isAuth: boolean;
  isNotFound: boolean;
  isRateLimit: boolean;
  isServer: boolean;
  retryable: boolean;
}

export function classifyError(err: unknown): ApiError {
  const anyErr = err as any;
  const status: number = anyErr?.response?.status ?? 0;
  const data = anyErr?.response?.data;
  const detail = data?.detail ?? data?.message;

  const messageFromDetail = (d: unknown): string => {
    if (!d) return "";
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((x) => {
          if (typeof x === "object" && x && "msg" in x) {
            const err = x as any;
            if (Array.isArray(err.loc) && err.loc.length > 1) {
              const field = String(err.loc[err.loc.length - 1]);
              const human = field
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());
              return `${human}: ${err.msg}`;
            }
            return String(err.msg);
          }
          return String(x);
        })
        .filter(Boolean)
        .join(" • ");
    }
    if (typeof d === "object") return JSON.stringify(d);
    return String(d);
  };

  const message =
    messageFromDetail(detail) ||
    anyErr?.message ||
    (status === 0 ? "Network error. Check your connection." : "Something went wrong");

  return {
    status,
    message,
    detail,
    isNetwork: status === 0,
    isAuth: status === 401 || status === 403,
    isNotFound: status === 404,
    isRateLimit: status === 429,
    isServer: status >= 500,
    retryable: status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600),
  };
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  const e = classifyError(err);
  if (e.isNetwork) return "You're offline. Check your connection and try again.";
  if (e.isRateLimit) return "Too many requests. Please wait a moment and try again.";
  if (e.isServer) return "Our servers are having a moment. Please retry shortly.";
  if (e.isAuth) return e.message || "You need to sign in again.";
  return e.message || fallback;
}
