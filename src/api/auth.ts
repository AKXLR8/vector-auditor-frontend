import client from "./client";

export interface LoginResponse {
  access_token: string;
  user_id: string;
  email: string;
  username?: string | null;
  display_name?: string | null;
  roles: string[];
}

export async function register(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
  username?: string,
): Promise<void> {
  const payload: Record<string, string> = { email, password };
  if (firstName?.trim()) payload.first_name = firstName.trim();
  if (lastName?.trim()) payload.last_name = lastName.trim();
  if (username?.trim()) payload.username = username.trim();
  await client.post("/auth/register", payload);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await client.post("/auth/login", { email, password });
  return data;
}

export async function loginMfa(mfaToken: string, code: string): Promise<LoginResponse> {
  const { data } = await client.post("/auth/login/mfa", { code }, {
    headers: { Authorization: `Bearer ${mfaToken}` },
  });
  return data;
}

export async function refreshToken(): Promise<LoginResponse> {
  const { data } = await client.get("/auth/token/refresh");
  return data;
}

export async function logout(): Promise<void> {
  await client.post("/auth/logout");
}

export async function mfaSetup(): Promise<{ secret: string; uri: string; qr_code_url: string }> {
  const { data } = await client.post("/auth/mfa/setup");
  return data;
}

export async function mfaVerify(code: string): Promise<{ access_token: string; user_id: string; roles: string[] }> {
  const { data } = await client.post("/auth/mfa/verify", { code });
  return data;
}

export async function getProfile(): Promise<{ display_name?: string; username?: string; email?: string }> {
  try {
    const { data } = await client.get("/auth/me");
    return data;
  } catch {
    return {};
  }
}

export async function health(): Promise<{ status: string; version: string; checks: Record<string, string> }> {
  const { data } = await client.get("/health");
  return data;
}

export async function fetchOAuthConfig(): Promise<{ github_client_id: string }> {
  const { data } = await client.get("/auth/oauth/config");
  return data;
}

export async function oauthGithub(code: string): Promise<LoginResponse> {
  const { data } = await client.post("/auth/oauth/github", { code });
  return data;
}
