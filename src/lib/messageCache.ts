import Dexie, { type Table } from "dexie";
import type { Message } from "../types";

interface CachedSession {
  id: string;
  messages: Message[];
  updatedAt: number;
}

class MessageDB extends Dexie {
  sessions!: Table<CachedSession, string>;

  constructor() {
    super("vector_auditor_messages");
    this.version(1).stores({
      sessions: "id, updatedAt",
    });
  }
}

const db = new MessageDB();

export async function getMessages(sessionId: string): Promise<Message[] | null> {
  try {
    const row = await db.sessions.get(sessionId);
    if (!row) return null;
    const stale = Date.now() - row.updatedAt > 300_000;
    return stale ? null : row.messages;
  } catch {
    return null;
  }
}

export async function setMessages(sessionId: string, messages: Message[]) {
  try {
    await db.sessions.put({ id: sessionId, messages, updatedAt: Date.now() });
  } catch {
    /* indexedDB unavailable */
  }
}

export async function removeMessages(sessionId: string) {
  try {
    await db.sessions.delete(sessionId);
  } catch {
    /* ignore */
  }
}

export async function clearAllMessages() {
  try {
    await db.sessions.clear();
  } catch {
    /* ignore */
  }
}
