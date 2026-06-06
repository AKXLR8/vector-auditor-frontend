import { useCallback, useEffect, useRef } from "react";
import { listDocuments } from "../api/documents";
import type { Document } from "../types";

const CHANNEL_NAME = "vector-auditor-docs";

export type DocDiff = {
  added: Document[];
  removed: Document[];
  updated: { before: Document; after: Document }[];
};

export type DocSyncOptions = {
  enabled?: boolean;
  intervalMs?: number;
  onDocs: (docs: Document[]) => void;
  onDiff?: (diff: DocDiff) => void;
  onError?: (err: unknown) => void;
};

export type DocSyncResult = {
  refetch: () => Promise<void>;
  broadcast: () => void;
  notify: () => void;
};

function docKey(d: Document): string {
  return d.document_id ?? d.id ?? (d as any).sha256 ?? "";
}

function sameIdentity(a: Document, b: Document): boolean {
  return a.filename === b.filename && a.status === b.status;
}

function isEmptyDiff(d: DocDiff): boolean {
  return d.added.length === 0 && d.removed.length === 0 && d.updated.length === 0;
}

export function useDocumentSync({
  enabled = true,
  intervalMs = 10_000,
  onDocs,
  onDiff,
  onError,
}: DocSyncOptions): DocSyncResult {
  const previousDocsRef = useRef<Document[] | null>(null);
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const onDocsRef = useRef(onDocs);
  const onDiffRef = useRef(onDiff);
  const onErrorRef = useRef(onError);
  onDocsRef.current = onDocs;
  onDiffRef.current = onDiff;
  onErrorRef.current = onError;

  const performFetch = useCallback(async (): Promise<void> => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const fresh = await listDocuments();
      const prev = previousDocsRef.current;
      onDocsRef.current(fresh);
      if (hasFetchedRef.current && prev) {
        const prevMap = new Map(prev.map((d) => [docKey(d), d]));
        const freshMap = new Map(fresh.map((d) => [docKey(d), d]));
        const added: Document[] = [];
        const removed: Document[] = [];
        const updated: { before: Document; after: Document }[] = [];
        for (const [k, d] of freshMap) {
          const before = prevMap.get(k);
          if (!before) added.push(d);
          else if (!sameIdentity(before, d)) updated.push({ before, after: d });
        }
        for (const [k, d] of prevMap) {
          if (!freshMap.has(k)) removed.push(d);
        }
        const diff: DocDiff = { added, removed, updated };
        if (!isEmptyDiff(diff)) onDiffRef.current?.(diff);
      }
      previousDocsRef.current = fresh;
      hasFetchedRef.current = true;
    } catch (err) {
      if (hasFetchedRef.current) onErrorRef.current?.(err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  const refetch = useCallback(() => performFetch(), [performFetch]);

  const broadcast = useCallback(() => {
    channelRef.current?.postMessage({ type: "docs-changed", at: Date.now() });
  }, []);

  const notify = useCallback(() => {
    void performFetch();
    channelRef.current?.postMessage({ type: "docs-changed", at: Date.now() });
  }, [performFetch]);

  useEffect(() => {
    if (!enabled) return;

    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (ev) => {
        if (ev.data?.type === "docs-changed") {
          void performFetch();
        }
      };
    }

    void performFetch();
    intervalRef.current = setInterval(performFetch, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void performFetch();
    };
    const onFocus = () => {
      void performFetch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      channelRef.current?.close();
      channelRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs, performFetch]);

  return { refetch, broadcast, notify };
}
