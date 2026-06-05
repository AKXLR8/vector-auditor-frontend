import client from "./client";
import type { ChatSession, ChatMessage } from "../types";

export async function listSessions(): Promise<ChatSession[]> {
  const { data } = await client.get("/sessions");
  return data.sessions || [];
}

export async function createSession(title?: string, id?: string): Promise<ChatSession> {
  const { data } = await client.post("/sessions", { title: title || "New Chat", ...(id ? { id } : {}) });
  return data;
}

export async function getSession(id: string): Promise<ChatSession & { messages: ChatMessage[] }> {
  const { data } = await client.get(`/sessions/${id}`);
  return data;
}

export async function updateSession(id: string, updates: { title?: string }): Promise<ChatSession> {
  const { data } = await client.put(`/sessions/${id}`, updates);
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  await client.delete(`/sessions/${id}`);
}

export async function addMessage(sessionId: string, msg: {
  role: string;
  content: string;
  citations?: any;
  reasoning_path?: string[];
  tokens_used?: number;
  cost_usd?: number;
  query_id?: string;
  verification?: string | null;
}): Promise<ChatMessage> {
  const { data } = await client.post(`/sessions/${sessionId}/messages`, msg);
  return data;
}

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await client.get(`/sessions/${sessionId}/messages`);
  return data.messages || [];
}
