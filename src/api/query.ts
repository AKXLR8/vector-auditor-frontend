import client from "./client";
import { getApiBaseUrl } from "./config";
import type { QueryRequest, QueryResponse, FeedbackRequest, StreamEvent } from "../types";

export async function sendQuery(req: QueryRequest): Promise<QueryResponse> {
  const { data } = await client.post("/query", req);
  return data;
}

export async function submitFeedback(fb: FeedbackRequest): Promise<void> {
  await client.post("/feedback", fb);
}

export async function* streamQuery(req: QueryRequest): AsyncGenerator<StreamEvent> {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${getApiBaseUrl()}/api/query/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(trimmed.slice(6)) as StreamEvent;
          yield parsed;
        } catch {
          /* skip malformed events */
        }
      }
    }
  }
}
