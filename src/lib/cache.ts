const CACHE_PREFIX = "va_cache_";
const DEFAULT_TTL = 300_000;

export function setCache<T>(key: string, data: T, ttl = DEFAULT_TTL) {
  try {
    const entry = { data, ts: Date.now(), ttl };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* storage full */
  }
}

export function getCache<T>(key: string): { data: T; stale: boolean } | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const stale = Date.now() - entry.ts > entry.ttl;
    return { data: entry.data as T, stale };
  } catch {
    return null;
  }
}

export function removeCache(key: string) {
  localStorage.removeItem(CACHE_PREFIX + key);
}
