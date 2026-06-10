import client from "./client";
import type { User } from "../types";

export async function register(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string
): Promise<User> {
  const payload: Record<string, string> = { email, password };
  if (firstName?.trim()) payload.first_name = firstName.trim();
  if (lastName?.trim()) payload.last_name = lastName.trim();
  const { data } = await client.post("/auth/register", payload);
  return data;
}

export async function login(email: string, password: string): Promise<{ access_token: string; user_id: string; roles: string[] }> {
  const { data } = await client.post("/auth/login", { email, password });
  return data;
}

export async function loginMfa(mfaToken: string, code: string): Promise<{ access_token: string; user_id: string; roles: string[] }> {
  const { data } = await client.post("/auth/login/mfa", { code }, {
    headers: { Authorization: `Bearer ${mfaToken}` },
  });
  return data;
}

export async function refreshToken(): Promise<{ access_token: string; user_id: string; roles: string[] }> {
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

export async function mfaVerify(code: string): Promise<User> {
  const { data } = await client.post("/auth/mfa/verify", { code });
  return data;
}

export async function getProfile(): Promise<{ display_name?: string; email?: string }> {
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

export async function oauthGithub(code: string): Promise<{ access_token: string; user_id: string; roles: string[] }> {
  const { data } = await client.post("/auth/oauth/github", { code });
  return data;
}
