export function getApiBaseUrl(): string {
  return (window as any).BACKEND_URL ?? "";
}
