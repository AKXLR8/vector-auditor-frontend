import client from "./client";
import { getApiBaseUrl } from "./config";
import type {
  QueryRequest,
  QueryResponse,
  FeedbackRequest,
  StreamEvent,
  DocumentAnalysis,
} from "../types";

export class StreamAbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "StreamAbortError";
  }
}

export async function sendNexAGI(
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const { data } = await client.post("/NexAGI", {
    messages,
    model: "nex-agi/nex-n2-pro:free",
    reasoning: true,
  });
  return data.choices?.[0]?.message?.content ?? data.content ?? data.answer ?? "";
}

export async function sendQuery(req: QueryRequest): Promise<QueryResponse> {
  const { data } = await client.post("/query", req);
  return data;
}

export async function submitFeedback(fb: FeedbackRequest): Promise<void> {
  await client.post("/feedback", fb);
}

export interface AnalyzeRequest {
  question?: string;
  document_ids?: string[];
  max_citations?: number;
}

export async function analyzeDocuments(req: AnalyzeRequest): Promise<DocumentAnalysis> {
  const { data } = await client.post("/analyze", req);
  return data;
}

export interface StreamOptions {
  signal?: AbortSignal;
}

export async function* streamQuery(
  req: QueryRequest,
  options: StreamOptions = {}
): AsyncGenerator<StreamEvent> {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${getApiBaseUrl()}/query/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.detail ?? text;
    } catch {
      /* keep raw text */
    }
    const err: any = new Error(typeof detail === "string" ? detail : "Stream request failed");
    err.response = { status: response.status, data: { detail } };
    throw err;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as StreamEvent;
          yield parsed;
        } catch {
          /* skip malformed events */
        }
      }
    }
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      throw new StreamAbortError();
    }
    throw err;
  }
}
