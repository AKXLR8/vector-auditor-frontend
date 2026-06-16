export function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && (window as any).BACKEND_URL) {
    return (window as any).BACKEND_URL;
  }
  return import.meta.env.VITE_API_URL ?? "";
}
