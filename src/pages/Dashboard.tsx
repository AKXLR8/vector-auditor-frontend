import { useState, useRef, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useAuth } from "../context/AuthContext";
import DocumentViewer from "../components/DocumentViewer";
import DocumentsPanel from "../components/DocumentsPanel";
import { CommandPalette } from "../components/CommandPalette";
import { MessageActions } from "../components/MessageActions";
import { AutoGrowTextarea } from "../components/AutoGrowTextarea";
import { QueryControls } from "../components/QueryControls";
import { ScrollToBottom } from "../components/ScrollToBottom";
import { ChatListSkeleton, DocListSkeleton, MessageSkeleton } from "../components/Skeleton";
import { FileDropZone } from "../components/FileDropZone";
import { OnboardingEmpty } from "../components/OnboardingEmpty";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HeroVideo } from "../components/HeroVideo";
import { useDebounce } from "../hooks/useDebounce";
import { useSwipeGesture } from "../hooks/useSwipeGesture";
import { useDocumentSync, type DocDiff } from "../hooks/useDocumentSync";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { errorMessage } from "../lib/errors";
import { sendQuery, streamQuery, submitFeedback, StreamAbortError } from "../api/query";
import { uploadDocuments, getDocument, deleteDocument } from "../api/documents";
import { getUploadProgress } from "../api/uploads";
import { getApiBaseUrl } from "../api/config";
import {
  listSessions as apiListSessions,
  createSession as apiCreateSession,
  updateSession as apiUpdateSession,
  deleteSession as apiDeleteSession,
  addMessage as apiAddMessage,
  getSession as apiGetSession,
  listMessages as apiListMessages,
} from "../api/sessions";
import type {
  Document, Message, Citation, DocGroup,
  ChatSession as ServerSession, LocalSession, QueryMode,
} from "../types";
import {
  PaperPlaneRight, Plus, FileText, X,
  ThumbsUp, ThumbsDown, User, SignOut,
  Spinner, Robot, WarningCircle, ChatText,
  Quotes, MagnifyingGlass, House,
  Folder, PushPin, PencilSimple, Check, XCircle,
  Command, Sparkle, List,
} from "@phosphor-icons/react";

const GROUPS_KEY = "vector_doc_groups";
const PINNED_KEY_PREFIX = "pinned_sessions_";

function loadGroups(): DocGroup[] {
  try { const raw = localStorage.getItem(GROUPS_KEY); if (raw) return JSON.parse(raw); } catch { }
  return [];
}

function saveGroups(groups: DocGroup[]) {
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch { }
}

function pinnedKey(userId: string) {
  return `${PINNED_KEY_PREFIX}${userId || "anon"}`;
}

const WELCOME_TIMESTAMP = "2024-01-01T00:00:00.000Z";
const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content: "Upload documents, then ask me anything about them. I'll cite my sources.",
  timestamp: WELCOME_TIMESTAMP,
};

function freshWelcome(): Message {
  return { id: "welcome", role: "assistant", content: WELCOME_MSG.content, timestamp: WELCOME_TIMESTAMP };
}

function sessionsKey(userId: string) {
  return `chat_sessions_${userId}`;
}

function activeIdKey(userId: string) {
  return `active_session_id_${userId}`;
}

function loadSessions(userId: string): LocalSession[] {
  try {
    const raw = localStorage.getItem(sessionsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as LocalSession[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

function saveSessions(userId: string, sessions: LocalSession[]) {
  try {
    localStorage.setItem(sessionsKey(userId), JSON.stringify(sessions));
  } catch { /* storage full */ }
}

function deriveTitle(messages: Message[]): string {
  const nonWelcome = messages.filter((m) => m.role === "user");
  if (nonWelcome.length === 0) return "New Chat";
  const first = nonWelcome[0].content;
  return first.length > 40 ? first.slice(0, 40) + "..." : first;
}

const syncedCache = new Map<string, Set<string>>();
function getSyncedSet(sessionId: string): Set<string> {
  let set = syncedCache.get(sessionId);
  if (set) return set;
  set = new Set<string>();
  try {
    const raw = localStorage.getItem(`synced_msgs_${sessionId}`);
    if (raw) (JSON.parse(raw) as string[]).forEach((id) => set!.add(id));
  } catch { /* ignore */ }
  syncedCache.set(sessionId, set);
  return set;
}
function persistSyncedSet(sessionId: string, set: Set<string>) {
  try { localStorage.setItem(`synced_msgs_${sessionId}`, JSON.stringify([...set])); } catch { /* ignore */ }
}

function docDisplayName(doc: { filename?: string | null; document_id?: string; id?: string }): string {
  const f = (doc.filename || "").trim();
  if (f) return f;
  const id = (doc.document_id ?? doc.id ?? "?").toString();
  return `Untitled (${id.slice(0, 8)})`;
}

function docExt(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 && i < filename.length - 1 ? filename.slice(i + 1).toLowerCase() : "";
}

type DocStatusKey = "ready" | "processing" | "failed" | "unknown";
function docStatusKey(doc: { status?: string | null; has_pii?: boolean }): DocStatusKey {
  const s = (doc.status || "").toLowerCase();
  if (s === "success" || s === "ready" || s === "completed" || s === "indexed") return "ready";
  if (s === "processing" || s === "queued" || s === "parsing" || s === "indexing" || s === "uploading") return "processing";
  if (s === "failed" || s === "error") return "failed";
  return "unknown";
}

const DOC_STATUS_PILL: Record<DocStatusKey, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "bg-green-500/15 text-green-400/80" },
  processing: { label: "Processing", cls: "bg-blue-500/15 text-blue-400/80" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-400/80" },
  unknown: { label: "Pending", cls: "bg-white/[0.06] text-white/50" },
};

function loadActiveId(userId: string): string | null {
  try { return localStorage.getItem(activeIdKey(userId)); } catch { return null; }
}
function saveActiveId(userId: string, id: string | null) {
  try { if (id) localStorage.setItem(activeIdKey(userId), id); else localStorage.removeItem(activeIdKey(userId)); } catch { /* ignore */ }
}

function enrichCitations(content: string): string {
  return content.replace(
    /【(\d+)(?:†[^】]*)?】|\[(\d+)\]/g,
    (_match, jpIdx, bracketIdx) => {
      const idx = jpIdx || bracketIdx;
      return `<sup class="cit-chip" data-idx="${idx}"><button type="button" class="cit-chip-btn" aria-label="Open citation ${idx}">[${idx}]</button></sup>`;
    }
  );
}

function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + (m.tokens_used || 0), 0);
}

const LogoIcon = ({ className }: { className?: string }) => (
  <img src="/logo.png" alt="Logo" className={`${className || ""} object-contain`} />
);

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  cloudinary: "Uploading to cloud",
  parsing: "Parsing document",
  indexing: "Indexing vectors",
  saving: "Saving metadata",
  completed: "Completed",
  failed: "Failed",
  duplicate: "Already in library",
  skipped: "Skipped",
  stuck: "Taking longer than expected",
};

const TERMINAL_STAGES = new Set(["completed", "failed", "duplicate", "skipped", "stuck"]);
const STUCK_TIMEOUT_MS = 60_000;

function DiffusingMarkdown({ content, streaming }: { content: string; streaming: boolean }) {
  const lastLen = useRef(0);
  if (!streaming) {
    lastLen.current = 0;
    return (
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {enrichCitations(content)}
      </Markdown>
    );
  }
  const prev = lastLen.current;
  lastLen.current = content.length;
  const oldText = content.slice(0, prev);
  const newText = content.slice(prev);
  return (
    <>
      {oldText && (
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
          {enrichCitations(oldText)}
        </Markdown>
      )}
      {newText && (
        <span className="diffuse-in">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
            {enrichCitations(newText)}
          </Markdown>
        </span>
      )}
    </>
  );
}

const components: any = {
  h1: ({ children, ...props }: any) => <h1 {...props} className="text-xl font-bold mt-4 mb-2 text-[#F2F2F2]">{children}</h1>,
  h2: ({ children, ...props }: any) => <h2 {...props} className="text-lg font-semibold mt-3 mb-2 text-[#F2F2F2]">{children}</h2>,
  h3: ({ children, ...props }: any) => <h3 {...props} className="text-base font-semibold mt-2 mb-1 text-[#F2F2F2]">{children}</h3>,
  p: ({ children, ...props }: any) => <p {...props} className="mb-3 leading-relaxed">{children}</p>,
  ul: ({ children, ...props }: any) => <ul {...props} className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
  ol: ({ children, ...props }: any) => <ol {...props} className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
  li: ({ children, ...props }: any) => <li {...props} className="text-sm">{children}</li>,
  code: ({ children, className, ...props }: any) =>
    className ? (
      <code {...props} className="block bg-[#000000] border border-[#102321] rounded-lg p-3 text-xs font-mono overflow-x-auto mb-3">{children}</code>
    ) : (
      <code {...props} className="bg-[#0D1C1A] px-1.5 py-0.5 rounded text-xs font-mono text-[#3B82F6]">{children}</code>
    ),
  pre: ({ children, ...props }: any) => <pre {...props} className="mb-3">{children}</pre>,
  blockquote: ({ children, ...props }: any) => (
    <blockquote {...props} className="border-l-2 border-[#102321] pl-3 italic text-[#9DAFAC] mb-3">{children}</blockquote>
  ),
  a: ({ href, children, ...props }: any) => (
    <a href={href} {...props} target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline">{children}</a>
  ),
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto mb-3">
      <table {...props} className="w-full text-sm border-collapse border border-[#102321]">{children}</table>
    </div>
  ),
  th: ({ children, ...props }: any) => <th {...props} className="border border-[#102321] px-3 py-2 bg-[#0D1C1A] text-left font-semibold">{children}</th>,
  td: ({ children, ...props }: any) => <td {...props} className="border border-[#102321] px-3 py-2">{children}</td>,
  hr: (props: any) => <hr {...props} className="border-[#102321] my-4" />,
  sup: ({ children, ...props }: any) => <sup {...props}>{children}</sup>,
  button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
};

export default function Dashboard() {
  const { user, logout: authLogout, isAdmin, loading: authLoading } = useAuth();
  const uid = user?.id || "";
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([freshWelcome()]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [docGroups, setDocGroups] = useState<DocGroup[]>(loadGroups);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [sidebarDragOverGroup, setSidebarDragOverGroup] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarForcedClosedRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, { stage: string; progress: number; error?: string }>>({});
  const [activePdf, setActivePdf] = useState<{ docId: string; citation: Citation; page: number; cloudinaryUrl?: string } | null>(null);
  const [activePanel, setActivePanel] = useState<"documents" | null>(null);

  const [chatSearch, setChatSearch] = useState("");
  const debouncedChatSearch = useDebounce(chatSearch, 120);
  const [docSearch, setDocSearch] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [pinnedIds, setPinnedIds] = useLocalStorage<string[]>(pinnedKey(uid), []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [queryMode, setQueryMode] = useLocalStorage<QueryMode>("query_mode", "white_box");
  const [maxCitations, setMaxCitations] = useLocalStorage<number>("query_max_citations", 20);

  const messagesEnd = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const fileInput = useRef<HTMLInputElement>(null);
  const streamContentRef = useRef<Map<string, string>>(new Map());
  const handleCitationClickRef = useRef<(c: Citation) => void>(() => {});
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadStartedAtRef = useRef<Map<string, number>>(new Map());
  const uploadToDocRef = useRef<Map<string, string>>(new Map());
  const sessionsRef = useRef<LocalSession[]>(sessions);
  sessionsRef.current = sessions;
  const sessionFetchTokenRef = useRef(0);
  const sessionCreateInflightRef = useRef<Set<string>>(new Set());
  const userLoadTokenRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  useSwipeGesture({
    onSwipeRight: () => { if (isMobile) setSidebarOpen(true); },
    onSwipeLeft: () => { if (isMobile && sidebarOpen) setSidebarOpen(false); },
    threshold: 60,
    enabled: isMobile,
  });

  const mapServerMessages = (raw: any[]): Message[] =>
    (raw || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citations: m.citations || undefined,
      reasoning_path: m.reasoning_path || undefined,
      tokens_used: m.tokens_used || undefined,
      cost_usd: m.cost_usd || undefined,
      query_id: m.query_id || undefined,
      verification: m.verification || undefined,
      timestamp: m.created_at || new Date().toISOString(),
    }));

  const fetchAndApplySessionMessages = useCallback(
    (sessionId: string, myToken: number, tokenRef: { current: number }) => {
      apiGetSession(sessionId)
        .then((full) => {
          if (myToken !== tokenRef.current) return;
          const serverMsgs = (full as any).messages || [];
          if (serverMsgs.length > 0) {
            const mapped = mapServerMessages(serverMsgs);
            setMessages(mapped);
            setSessions((prev) => {
              const upd = prev.map((s) =>
                s.id === sessionId ? { ...s, messages: mapped } : s
              );
              saveSessions(uid, upd);
              return upd;
            });
          } else {
            setMessages((cur) => (cur.length === 0 ? [freshWelcome()] : cur));
          }
        })
        .catch(() => {
          if (myToken !== tokenRef.current) return;
        });
    },
    [uid]
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSessionId = searchParams.get("c");

  const tokensUsed = totalTokens(messages);
  const accountName = user?.display_name || user?.email?.split("@")[0] || "User";
  const subtitle = user?.display_name || user?.email?.split("@")[0] || "—";
  const hasRealMessages = messages.some((m) => m.role === "user");
  const showVideoBg = !hasRealMessages;

  useKeyboardShortcuts([
    { key: "k", meta: true, handler: () => setPaletteOpen((o) => !o), allowInInputs: true },
    { key: "k", ctrl: true, handler: () => setPaletteOpen((o) => !o), allowInInputs: true },
    { key: "/", meta: true, handler: () => fileInput.current?.click() },
    { key: "/", ctrl: true, handler: () => fileInput.current?.click() },
    { key: "n", meta: true, handler: () => newChat(), allowInInputs: true },
    { key: "n", ctrl: true, handler: () => newChat(), allowInInputs: true },
    { key: "Escape", handler: () => { if (paletteOpen) setPaletteOpen(false); if (activePanel === "documents") setActivePanel(null); if (activePdf) setActivePdf(null); } },
  ]);

  const onDropFiles = (files: FileList | null) => {
    if (files && files.length > 0) handleUpload(files);
  };

  // Deduplicate documents by sha256 (keep most recent per unique content)
  const dedupedDocs = useMemo(() => {
    const seen = new Set<string>();
    return docs.filter((d) => {
      const key = (d as any).sha256 || (d.document_id ?? d.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [docs]);

  const handleDocDiff = useCallback((diff: DocDiff) => {
    if (diff.removed.length > 0) {
      const label = diff.removed.length === 1
        ? `"${diff.removed[0].filename || "Document"}" was removed`
        : `${diff.removed.length} documents were removed`;
      toast(label, { icon: "🗑️", duration: 2500 });
    }
    if (diff.added.length > 0) {
      const first = diff.added[0].filename || "New document";
      const label = diff.added.length === 1 ? `${first} added to library` : `${diff.added.length} new documents added`;
      toast(label, { icon: "📥", duration: 2500 });
    }
    const justReady = diff.updated.filter(
      (u) => u.before.status !== u.after.status && u.after.status === "ready",
    );
    if (justReady.length > 0) {
      const first = justReady[0].after.filename || "Document";
      const label = justReady.length === 1 ? `${first} is ready` : `${justReady.length} documents are ready`;
      toast.success(label);
    }
  }, []);

  const { refetch, notify } = useDocumentSync({
    enabled: !!uid,
    onDocs: (fresh) => {
      setDocs((prev) => {
        const serverIds = new Set(fresh.map((d) => d.document_id ?? d.id));
        const pending = prev.filter((d) => {
          const id = d.document_id ?? d.id;
          return d.status === "processing" && !serverIds.has(id);
        });
        return [...pending, ...fresh];
      });
      setDocsLoading(false);
    },
    onError: () => {
      setDocsLoading(false);
      toast.error("Failed to load documents");
    },
    onDiff: handleDocDiff,
  });

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      await refetch();
    } finally {
      setDocsLoading(false);
    }
  }, [refetch]);

  // Persist groups to localStorage
  useEffect(() => { saveGroups(docGroups); }, [docGroups]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setSidebarOpen(!mq.matches);
    if (!uid) return;
    const myToken = ++userLoadTokenRef.current;
    const localSessions = loadSessions(uid);
    apiListSessions().then((serverSessions) => {
      if (myToken !== userLoadTokenRef.current) return;
      const merged: LocalSession[] = [];
      const seenIds = new Set<string>();
      for (const ss of serverSessions) {
        seenIds.add(ss.id);
        const existing = localSessions.find((ls) => ls.id === ss.id);
        merged.push({
          id: ss.id,
          title: ss.title || "New Chat",
          messages: existing?.messages || [],
          createdAt: ss.created_at,
        });
      }
      for (const ls of localSessions) {
        if (!seenIds.has(ls.id)) {
          merged.push(ls);
        }
      }
      setSessions(merged);
      saveSessions(uid, merged);
      if (urlSessionId && merged.some((s) => s.id === urlSessionId)) {
        const s = merged.find((x) => x.id === urlSessionId)!;
        setActiveSessionId(s.id);
        setMessages(s.messages.length > 0 ? s.messages : [freshWelcome()]);
        fetchAndApplySessionMessages(s.id, myToken, userLoadTokenRef);
      } else {
        setActiveSessionId(null);
        setMessages([freshWelcome()]);
        saveActiveId(uid, null);
      }
    }).catch(() => {
      if (myToken !== userLoadTokenRef.current) return;
      setSessions(localSessions);
      if (urlSessionId && localSessions.some((s) => s.id === urlSessionId)) {
        const s = localSessions.find((x) => x.id === urlSessionId)!;
        setActiveSessionId(s.id);
        setMessages(s.messages.length > 0 ? s.messages : [freshWelcome()]);
      } else {
        setActiveSessionId(null);
        setMessages([freshWelcome()]);
        saveActiveId(uid, null);
      }
    });
  }, [user?.id, fetchAndApplySessionMessages]);

  useEffect(() => {
    if (uid) {
      void refetch();
    }
  }, [uid, refetch]);

  useEffect(() => {
    if (activePdf && sidebarOpen) {
      sidebarForcedClosedRef.current = true;
      setSidebarOpen(false);
    } else if (!activePdf && sidebarForcedClosedRef.current) {
      sidebarForcedClosedRef.current = false;
      setSidebarOpen(true);
    }
  }, [activePdf]);

  const firstScrollDoneRef = useRef(false);
  useEffect(() => {
    const el = chatContainerRef.current;
    const target = messagesEnd.current;
    if (!el || !target) return;
    if (!firstScrollDoneRef.current) {
      target.scrollIntoView({ block: "end" });
      firstScrollDoneRef.current = true;
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 400) {
      target.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    if (urlSessionId && urlSessionId !== activeSessionId && sessions.some((s) => s.id === urlSessionId)) {
      const s = sessions.find((x) => x.id === urlSessionId);
      if (s) switchToSession(s);
    }
  }, [urlSessionId, sessions]);

  useEffect(() => {
    const target = activeSessionId;
    const current = searchParams.get("c");
    if (target === current) return;
    const next = new URLSearchParams(searchParams);
    if (target) next.set("c", target);
    else next.delete("c");
    setSearchParams(next, { replace: true });
  }, [activeSessionId]);

  // Auto-save to localStorage (debounced so streaming tokens don't write on every chunk)
  useEffect(() => {
    if (!activeSessionId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      const title = deriveTitle(messages);
      setSessions((prev) => {
        const updated = prev.map((s) =>
          s.id === activeSessionId ? { ...s, messages: [...messages], title } : s
        );
        saveSessions(uid, updated);
        return updated;
      });
    }, 500);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [messages, activeSessionId, uid]);

  // Sync sessions to server in background (skip while streaming). Uses refs
  // for sessions/syncedIds so the 3s debounce is only reset by real changes
  // (activeSessionId / loading / user), not by the auto-save setSessions above.
  useEffect(() => {
    if (!activeSessionId || !uid || loading) return;
    const session = sessionsRef.current.find((s) => s.id === activeSessionId);
    if (!session) return;
    const timer = setTimeout(() => {
      const current = sessionsRef.current.find((s) => s.id === activeSessionId);
      if (!current) return;
      const msgs = current.messages;
      const title = deriveTitle(msgs);
      apiUpdateSession(activeSessionId, { title }).catch(() => {});

      const synced = getSyncedSet(activeSessionId);
      for (const msg of msgs) {
        if (synced.has(msg.id)) continue;
        if (!msg.content) continue;
        apiAddMessage(activeSessionId, {
          role: msg.role,
          content: msg.content,
          citations: msg.citations,
          reasoning_path: msg.reasoning_path,
          tokens_used: msg.tokens_used,
          cost_usd: msg.cost_usd,
          query_id: msg.query_id,
          verification: msg.verification,
        }).then(() => {
          synced.add(msg.id);
          persistSyncedSet(activeSessionId, synced);
        }).catch(() => {});
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeSessionId, user?.id, loading]);

  // Click handler for citation chips (delegated on document to handle dynamically rendered content)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest(".cit-chip-btn");
      if (!btn) return;
      const sup = btn.closest(".cit-chip") as HTMLElement | null;
      if (!sup) return;
      const idx = parseInt(sup.dataset.idx || "0", 10) - 1;
      const area = btn.closest(".citation-area") as HTMLElement | null;
      if (!area) return;
      const msgId = area.dataset.msgId;
      const msg = messagesRef.current.find((m) => m.id === msgId);
      if (!msg || !msg.citations || !msg.citations[idx]) return;
      handleCitationClickRef.current(msg.citations[idx]);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Poll upload progress and auto-remove terminal entries after 3s
  useEffect(() => {
    const ids = Object.keys(uploadProgress);
    if (ids.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Schedule removal of terminal entries after 3s
    for (const [uid, entry] of Object.entries(uploadProgress)) {
      if (TERMINAL_STAGES.has(entry.stage)) {
        const timer = setTimeout(() => {
          setUploadProgress((prev) => {
            if (!prev[uid] || !TERMINAL_STAGES.has(prev[uid].stage)) return prev;
            const next = { ...prev };
            delete next[uid];
            uploadStartedAtRef.current.delete(uid);
            return next;
          });
        }, 3000);
        timers.push(timer);
      }
    }

    const interval = setInterval(async () => {
      for (const uid of ids) {
        const entry = uploadProgress[uid];
        if (TERMINAL_STAGES.has(entry.stage)) continue;

        const startedAt = uploadStartedAtRef.current.get(uid) ?? Date.now();
        if (Date.now() - startedAt > STUCK_TIMEOUT_MS) {
          setUploadProgress((prev) => {
            if (prev[uid] && TERMINAL_STAGES.has(prev[uid].stage)) return prev;
            return { ...prev, [uid]: { stage: "stuck", progress: entry.progress, error: "Processing is taking longer than expected" } };
          });
          notify();
          toast("Upload is taking longer than expected — check the document library", { icon: "⏳", duration: 4000 });
          continue;
        }

        try {
          const p = await getUploadProgress(uid);
          if (TERMINAL_STAGES.has(p.stage)) {
            const label = STAGE_LABELS[p.stage] ?? p.stage;
            if (p.stage === "duplicate") {
              toast("Already in your library", { icon: "📄", duration: 2500 });
            } else if (p.stage === "skipped") {
              toast("Upload skipped", { icon: "⏭️", duration: 2500 });
            } else if (p.stage === "failed") {
              toast.error(p.error || "Upload failed");
              const docId = uploadToDocRef.current.get(uid);
              if (docId) {
                setDocs((p) => p.filter((d) => (d.document_id ?? d.id) !== docId));
                uploadToDocRef.current.delete(uid);
              }
            } else if (p.stage === "completed") {
              toast.success("Document ready");
            } else {
              toast(label);
            }
          }
          setUploadProgress((prev) => ({
            ...prev,
            [uid]: { stage: p.stage, progress: p.progress, error: p.error || undefined },
          }));
          if (TERMINAL_STAGES.has(p.stage)) {
            uploadToDocRef.current.delete(uid);
            notify();
          }
        } catch {
          uploadToDocRef.current.delete(uid);
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[uid];
            uploadStartedAtRef.current.delete(uid);
            return next;
          });
        }
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, [uploadProgress]);

  // Refresh document list whenever any upload reaches a terminal stage
  useEffect(() => {
    const terminal = Object.values(uploadProgress).some((p) => TERMINAL_STAGES.has(p.stage));
    if (terminal) {
      notify();
    }
  }, [uploadProgress]);

  const switchToSession = (session: LocalSession) => {
    const myToken = ++sessionFetchTokenRef.current;
    setActiveSessionId(session.id);
    saveActiveId(uid, session.id);
    setMessages(session.messages.length > 0 ? session.messages : [freshWelcome()]);
    fetchAndApplySessionMessages(session.id, myToken, sessionFetchTokenRef);
  };

  const ensureServerSession = useCallback(
    (id: string, title: string) => {
      const inflight = sessionCreateInflightRef.current;
      if (inflight.has(id)) return;
      inflight.add(id);
      apiCreateSession(title || "New Chat", id)
        .catch((err) => {
          inflight.delete(id);
          const status = err?.response?.status;
          if (status && status !== 409) {
            toast.error("Couldn't sync chat to server — saved locally only.");
          }
        })
        .finally(() => {
          window.setTimeout(() => inflight.delete(id), 30_000);
        });
    },
    []
  );

  const newChat = async () => {
    const id = crypto.randomUUID();
    const newSession: LocalSession = {
      id,
      title: "New Chat",
      messages: [freshWelcome()],
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => {
      const updated = [newSession, ...prev];
      saveSessions(uid, updated);
      return updated;
    });
    setActiveSessionId(id);
    saveActiveId(uid, id);
    setMessages(newSession.messages);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("c", id);
        return next;
      },
      { replace: true }
    );
    ensureServerSession(id, "New Chat");
    toast.success("New chat started");
  };

  const deleteSession = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      saveSessions(uid, updated);
      return updated;
    });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      saveActiveId(uid, null);
      setMessages([freshWelcome()]);
    }
    try { localStorage.removeItem(`synced_msgs_${id}`); } catch { /* ignore */ }
    syncedCache.delete(id);
    apiDeleteSession(id).catch(() => {});
    setPinnedIds((p) => p.filter((x) => x !== id));
    toast.success("Chat deleted");
  };

  const handlePaperPlaneRight = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const queryText = input.trim();
    await runQuery(queryText);
    setInput("");
  };

  const runQuery = async (queryText: string, opts: { assistantIdToReplace?: string; regenOfMessageId?: string } = {}) => {
    if (!queryText.trim()) return;

    const assistantId = opts.assistantIdToReplace || crypto.randomUUID();
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: queryText,
      timestamp: new Date().toISOString(),
    };
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      feedback: null,
      mode: queryMode,
    };

    if (opts.assistantIdToReplace) {
      setMessages((p) => {
        const idx = p.findIndex((m) => m.id === opts.regenOfMessageId);
        if (idx === -1) return [...p, userMsg, assistantPlaceholder];
        const before = p.slice(0, idx);
        const regenerated = { ...p[idx], content: "", citations: undefined, reasoning_path: undefined, verification: undefined, query_id: undefined, feedback: null };
        return [...before, regenerated, assistantPlaceholder];
      });
    } else {
      setMessages((p) => [...p, userMsg, assistantPlaceholder]);
    }
    setLoading(true);

    let sessionId = activeSessionId;
    if (!sessionId && !opts.assistantIdToReplace) {
      sessionId = crypto.randomUUID();
      const newSession: LocalSession = {
        id: sessionId,
        title: "New Chat",
        messages: [],
        createdAt: new Date().toISOString(),
      };
      setSessions((prev) => {
        const updated = [newSession, ...prev];
        saveSessions(uid, updated);
        return updated;
      });
      setActiveSessionId(sessionId);
      saveActiveId(uid, sessionId);
      ensureServerSession(sessionId, "New Chat");
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const historyMessages = messages
        .filter((m) => !m.id.startsWith("welcome-") && (!opts.assistantIdToReplace || m.id !== opts.regenOfMessageId))
        .map((m) => ({ role: m.role, content: m.content }));

      const req = {
        question: queryText,
        document_ids: selectedDocs.size > 0 ? Array.from(selectedDocs) : undefined,
        conversation_history: historyMessages.slice(-10),
        mode: queryMode,
        max_citations: maxCitations,
      };

      let citations: Citation[] | undefined;
      let reasoningPath: string[] | undefined;
      let verification: string | undefined;
      let queryId: string | undefined;
      let accumulated = "";

      streamContentRef.current.set(assistantId, "");

      for await (const event of streamQuery(req, { signal: controller.signal })) {
        if (event.type === "citations") {
          citations = event.citations as Citation[];
          reasoningPath = event.reasoning_path;
        } else if (event.type === "token") {
          accumulated += event.content || "";
          streamContentRef.current.set(assistantId, accumulated);
          setMessages((p) =>
            p.map((m) =>
              m.id === assistantId
                ? { ...m, content: accumulated, citations, reasoning_path: reasoningPath }
                : m
            )
          );
        } else if (event.type === "verification") {
          if (queryMode !== "black_box") verification = event.content;
        } else if (event.type === "gap_analysis") {
          if (queryMode !== "black_box") {
            accumulated += event.content || "";
            streamContentRef.current.set(assistantId, accumulated);
            setMessages((p) =>
              p.map((m) =>
                m.id === assistantId
                  ? { ...m, content: accumulated, verification }
                  : m
              )
            );
          }
        } else if (event.type === "done") {
          queryId = event.query_id;
          if (event.mode) {
            setMessages((p) =>
              p.map((m) => m.id === assistantId ? { ...m, mode: event.mode } : m)
            );
          }
        }
      }

      setMessages((p) =>
        p.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: accumulated || "No answer generated.",
                citations: citations || [],
                reasoning_path: reasoningPath || [],
                verification,
                query_id: queryId,
              }
            : m
        )
      );

      if (sessionId && !opts.assistantIdToReplace) {
        const synced = getSyncedSet(sessionId);
        synced.add(userMsg.id);
        persistSyncedSet(sessionId, synced);
        apiAddMessage(sessionId, { role: "user", content: queryText }).catch(() => {});
      }
    } catch (err: any) {
      if (err instanceof StreamAbortError) {
        setMessages((p) =>
          p.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || "_Generation stopped._" }
              : m
          )
        );
        return;
      }
      const msg = errorMessage(err, "Failed to get answer");
      setMessages((p) =>
        p.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${msg}` }
            : m
        )
      );
      toast.error(msg);
    } finally {
      setLoading(false);
      streamContentRef.current.delete(assistantId);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
  };

  const regenerateLast = useCallback(() => {
    if (loading) return;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user" && !messages[i].id.startsWith("welcome-")) {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUser = messages[lastUserIdx];
    const next = messages[lastUserIdx + 1];
    if (!next || next.role !== "assistant") return;
    runQuery(lastUser.content, { assistantIdToReplace: next.id, regenOfMessageId: next.id });
  }, [messages, loading]);

  const startEditMessage = (id: string, content: string) => {
    setEditingMessageId(id);
    setEditingMessageContent(content);
  };

  const submitEditMessage = (id: string) => {
    const newContent = editingMessageContent.trim();
    if (!newContent) {
      setEditingMessageId(null);
      return;
    }
    setMessages((p) => p.map((m) => m.id === id ? { ...m, content: newContent } : m));
    const targetIdx = messages.findIndex((m) => m.id === id);
    if (targetIdx === -1) {
      setEditingMessageId(null);
      return;
    }
    const next = messages[targetIdx + 1];
    setMessages((p) => p.filter((m) => m.id !== id && (next ? m.id !== next.id : true)));
    setEditingMessageId(null);
    if (next && next.role === "assistant") {
      runQuery(newContent, { assistantIdToReplace: next.id, regenOfMessageId: next.id });
    } else {
      runQuery(newContent);
    }
  };

  const copyLastAssistant = useCallback(async () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content) {
        try {
          await navigator.clipboard.writeText(messages[i].content);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Copy failed");
        }
        return;
      }
    }
  }, [messages]);

  const togglePin = (id: string) => {
    setPinnedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [id, ...p]);
  };

  const renameSession = (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      setEditingSessionId(null);
      return;
    }
    setSessions((p) => p.map((s) => s.id === id ? { ...s, title: trimmed } : s));
    saveSessions(uid, sessions.map((s) => s.id === id ? { ...s, title: trimmed } : s));
    apiUpdateSession(id, { title: trimmed }).catch(() => {});
    setEditingSessionId(null);
  };

  const handleFeedback = async (qid: string, up: boolean) => {
    try {
      await submitFeedback({ query_id: qid, thumbs_up: up });
      setMessages((p) => p.map((m) => m.query_id === qid ? { ...m, feedback: up } : m));
      toast(up ? "Marked helpful" : "Marked not helpful", { icon: up ? "👍" : "👎", duration: 2000 });
    } catch { /* ignore */ }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const res = await uploadDocuments(Array.from(files));
      const progressMap: Record<string, { stage: string; progress: number }> = {};
      const optimistic: Document[] = [];
      const now = Date.now();
      let duplicates = 0;
      let willTrack = 0;
      for (const item of res.uploaded_documents) {
        const status = (item.status || "").toLowerCase();
        if (status === "duplicate" || status === "skipped") {
          duplicates += 1;
          continue;
        }
        progressMap[item.upload_id] = { stage: "queued", progress: 0 };
        uploadStartedAtRef.current.set(item.upload_id, now);
        uploadToDocRef.current.set(item.upload_id, item.document_id);
        optimistic.push({
          id: item.document_id,
          document_id: item.document_id,
          filename: item.filename || "Untitled",
          status: "processing",
          has_pii: false,
          sha256: "",
          uploaded_by: uid,
          created_at: new Date().toISOString(),
        });
        willTrack += 1;
      }
      if (Object.keys(progressMap).length > 0) {
        setUploadProgress((prev) => ({ ...prev, ...progressMap }));
      }
      if (optimistic.length > 0) {
        setDocs((prev) => [...prev, ...optimistic]);
      }
      if (duplicates > 0) {
        const onlyDup = willTrack === 0;
        toast(onlyDup ? "Already in your library" : `${duplicates} duplicate${duplicates > 1 ? "s" : ""} skipped`, {
          icon: "📄",
          duration: 2500,
        });
      }
      if (willTrack > 0) {
        toast.success(`Upload started — ${willTrack} file${willTrack > 1 ? "s" : ""} processing`);
      }
      notify();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingIds.has(id)) return;
    setDeletingIds((p) => new Set(p).add(id));
    try {
      try {
        await deleteDocument(id);
        toast.success("Document deleted");
      } catch (err: any) {
        if (err?.response?.status === 404) {
          toast("Already removed", { icon: "🗑️", duration: 2000 });
        } else {
          toast.error(err?.response?.data?.detail || "Delete failed");
        }
      }
      setSelectedDocs((p) => { const n = new Set(p); n.delete(id); return n; });
      setDocGroups((prev) => prev.map((g) => ({ ...g, documentIds: g.documentIds.filter((d) => d !== id) })));
      setDocs((p) => p.filter((d) => (d.document_id ?? d.id) !== id));
      notify();
    } finally {
      setDeletingIds((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const handleCitationClick = async (citation: Citation) => {
    const page = citation.page && citation.page > 0 ? citation.page : 1;
    const docId = citation.document_id || docs.find((d) => d.filename === citation.source)?.document_id
      || docs.find((d) => d.filename === citation.source)?.id
      || citation.source;
    const cloudinaryUrl = `${getApiBaseUrl()}/documents/${docId}/pdf`;
    setActivePdf({ docId, citation, page, cloudinaryUrl });
    setActivePanel(null);
  };
  handleCitationClickRef.current = handleCitationClick;

  const filteredSessions = useMemo(() => {
    const q = debouncedChatSearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, debouncedChatSearch]);

  const { pinnedSessions, otherSessions } = useMemo(() => {
    const pinned = new Set(pinnedIds);
    const p: LocalSession[] = [];
    const o: LocalSession[] = [];
    for (const s of filteredSessions) {
      (pinned.has(s.id) ? p : o).push(s);
    }
    return { pinnedSessions: p, otherSessions: o };
  }, [filteredSessions, pinnedIds]);

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return dedupedDocs;
    return dedupedDocs.filter((d) => d.filename.toLowerCase().includes(q));
  }, [dedupedDocs, docSearch]);

  const renderSessionRow = (session: LocalSession) => {
    const isActive = activeSessionId === session.id;
    const isPinned = pinnedIds.includes(session.id);
    const isEditing = editingSessionId === session.id;
    return (
      <div
        key={session.id}
        onClick={() => { if (!isEditing) switchToSession(session); }}
        className={`group relative flex items-center gap-1.5 px-2.5 py-2.5 sm:py-2 rounded-xl cursor-pointer transition-[colors,opacity] duration-200 ml-1 ${
          isActive
            ? "bg-white/[0.07] border border-white/[0.1]"
            : "hover:bg-white/[0.04] border border-transparent"
        }`}
      >
        {isPinned && !isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r bg-[#3B82F6]/60" />}
        {isEditing ? (
          <input
            autoFocus
            value={editingSessionTitle}
            onChange={(e) => setEditingSessionTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameSession(session.id, editingSessionTitle);
              if (e.key === "Escape") setEditingSessionId(null);
            }}
            onBlur={() => renameSession(session.id, editingSessionTitle)}
            className="flex-1 min-w-0 bg-white/[0.06] border border-[#3B82F6]/30 rounded px-1.5 py-0.5 text-xs text-white outline-none"
          />
        ) : (
          <span className={`flex-1 min-w-0 truncate text-xs ${isActive ? "text-white font-medium" : "text-[#F2F2F2]/70"}`}>
            {session.title}
          </span>
        )}
        <div className={`flex items-center gap-0.5 shrink-0 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); togglePin(session.id); }}
            aria-label={isPinned ? "Unpin" : "Pin"}
            title={isPinned ? "Unpin" : "Pin"}
            className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
              isPinned ? "text-[#3B82F6] opacity-100" : "text-white/30 hover:text-white/60"
            }`}
          >
            <PushPin size={10} weight={isPinned ? "fill" : "regular"} />
          </button>
          {!isEditing && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditingSessionId(session.id); setEditingSessionTitle(session.title); }}
              aria-label="Rename"
              title="Rename"
              className="w-5 h-5 rounded flex items-center justify-center text-white/30 hover:text-white/60"
            >
              <PencilSimple size={10} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => deleteSession(session.id, e)}
            aria-label="Delete chat"
            title="Delete chat"
            className="w-5 h-5 rounded flex items-center justify-center text-white/30 hover:text-red-400"
          >
            <X size={10} />
          </button>
        </div>
      </div>
    );
  };

  const toggleDoc = (id: string) => {
    setSelectedDocs((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleGroupSelection = (group: DocGroup) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      const allInGroup = group.documentIds.every((did) => next.has(did));
      if (allInGroup) {
        group.documentIds.forEach((did) => next.delete(did));
      } else {
        group.documentIds.forEach((did) => next.add(did));
      }
      return next;
    });
  };

  const sidebarAddDocToGroup = (groupId: string, docId: string) => {
    const group = docGroups.find((g) => g.id === groupId);
    if (!group || group.documentIds.includes(docId)) return;
    setDocGroups(docGroups.map((g) => g.id === groupId ? { ...g, documentIds: [...g.documentIds, docId] } : g));
  };

  const sidebarHandleDragStart = (e: React.DragEvent, docId: string) => {
    e.dataTransfer.setData("text/plain", docId);
    e.dataTransfer.effectAllowed = "move";
  };

  const logoutAndReset = () => {
    localStorage.removeItem(sessionsKey(uid));
    localStorage.removeItem(activeIdKey(uid));
    authLogout();
    navigate("/");
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#070E0D] text-[#F2F2F2]">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Unified Sidebar (Chats + Documents) ── */}
      <motion.aside
        animate={{ x: sidebarOpen ? 0 : -300 }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="fixed top-0 md:top-3 bottom-0 md:bottom-3 left-0 md:left-3 z-30 w-screen md:w-[300px] flex flex-col overflow-hidden liquid-glass-sidebar will-change-[transform] safe-area-top safe-area-bottom"
      >
        {/* Logo + mobile close */}
        <div className="flex items-center gap-2 px-4 pt-5 md:pt-4 pb-1 shrink-0">
          <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
          <span className="text-sm font-semibold tracking-tight text-white/80">Vector Auditor</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search + command palette trigger */}
        <div className="px-3 pt-2 pb-2 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm transition-[colors] duration-200 focus-within:border-[#3B82F6]/30 focus-within:bg-white/[0.06]">
              <MagnifyingGlass size={14} className="shrink-0 text-white/40" />
              <input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Filter chats..."
                aria-label="Filter chats"
                className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/30 text-sm outline-none"
              />
              {chatSearch && (
                <button
                  type="button"
                  onClick={() => setChatSearch("")}
                  aria-label="Clear filter"
                  className="text-white/30 hover:text-white/60 transition-colors shrink-0"
                >
                  <XCircle size={13} weight="fill" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              title="Command palette (⌘K)"
              className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-[colors] duration-200"
            >
              <Command size={14} weight="bold" />
            </button>
          </div>
        </div>

        {/* Menu items */}
        <div className="px-3 space-y-1 shrink-0">
          <button onClick={newChat}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-white transition-[colors,transform] duration-300 active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #3B82F6, #1E3A5F)" }}
          >
            <Plus size={15} weight="bold" />
            New Chat
          </button>
          <Link
            to="/analysis"
            className="w-full flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.05] transition-[colors] duration-200"
          >
            <Sparkle size={13} weight="bold" className="text-[#60A5FA]" />
            Analysis
          </Link>
        </div>

        <div className="px-3 py-2 shrink-0">
          <div className="border-t border-white/[0.06]" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
          {/* ── Chats section ── */}
          <div>
            <div className="flex items-center gap-2 px-1 py-1">
              <ChatText size={14} className="text-[#9DAFAC]/60" />
              <span className="flex-1 text-sm font-medium text-[#9DAFAC]/80">Chats</span>
              <span className="text-[10px] text-[#9DAFAC]/40 font-mono">{sessions.length}</span>
            </div>

            {!chatSearch && sessions.length === 0 && (
              <OnboardingEmpty variant="no-chats" onAction={newChat} />
            )}

            {chatSearch && filteredSessions.length === 0 && sessions.length > 0 && (
              <OnboardingEmpty variant="no-search-results" searchQuery={chatSearch} />
            )}

            {pinnedSessions.length > 0 && (
              <div className="mb-1.5">
                <p className="px-1 py-1 text-[10px] uppercase tracking-wider text-[#9DAFAC]/40 font-medium flex items-center gap-1">
                  <PushPin size={9} weight="fill" /> Pinned
                </p>
                <div className="space-y-0.5">
                  {pinnedSessions.map((session) => renderSessionRow(session))}
                </div>
              </div>
            )}

            {otherSessions.length > 0 && (
              <div className="space-y-0.5">
                {pinnedSessions.length > 0 && (
                  <p className="px-1 py-1 text-[10px] uppercase tracking-wider text-[#9DAFAC]/40 font-medium">
                    All chats
                  </p>
                )}
                {otherSessions.map((session) => renderSessionRow(session))}
              </div>
            )}
          </div>

          {/* ── Documents section ── */}
          <div>
            <div className="flex items-center justify-between px-1 py-1">
              <button onClick={() => { setActivePanel("documents"); setActivePdf(null); }} className="flex items-center gap-1.5 text-sm font-medium text-[#9DAFAC]/80 hover:text-[#3B82F6] transition-[colors] duration-300">
                <FileText size={14} /> Documents <span className="font-normal text-xs text-[#9DAFAC]/40">{docsLoading ? <Spinner size={10} className="animate-spin inline" /> : `(${dedupedDocs.length})`}</span>
              </button>
              {dedupedDocs.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => setSelectedDocs(new Set(dedupedDocs.map((d) => d.document_id ?? d.id)))}
                    className="text-[10px] text-[#3B82F6]/70 hover:text-[#3B82F6] transition-colors">All</button>
                  <button onClick={() => setSelectedDocs(new Set())}
                    className="text-[10px] text-[#9DAFAC]/50 hover:text-[#9DAFAC]/80 transition-colors">None</button>
                </div>
              )}
            </div>
            {/* Upload progress */}
            {Object.keys(uploadProgress).length > 0 && (
              <div className="space-y-1.5 mb-2">
                {Object.entries(uploadProgress).map(([uid, prog]) => (
                  <div key={uid} className="px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04] space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#9DAFAC]/70">{STAGE_LABELS[prog.stage] || prog.stage}</span>
                      <span className="text-[#9DAFAC]/50 font-mono">{prog.progress}%</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: prog.progress / 100 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        style={{ transformOrigin: "left" }}
                        className={`h-full rounded-full will-change-[transform] ${
                          prog.stage === "failed"
                            ? "bg-red-500"
                            : prog.stage === "completed"
                            ? "bg-green-500"
                            : "bg-gradient-to-r from-[#3B82F6] to-[#1E3A5F]"
                        }`}
                      />
                    </div>
                    {prog.error && <p className="text-[10px] text-red-400/80">{prog.error}</p>}
                    {prog.stage === "completed" && (
                      <p className="text-[10px] text-green-400/80 flex items-center gap-1">Ready</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* ── Groups ── */}
            {docGroups.length > 0 && (
              <div className="space-y-0.5 mb-2">
                <div className="flex items-center justify-between px-1 py-1">
                  <span className="text-sm font-medium text-[#9DAFAC]/80">Groups</span>
                  <span className="text-[10px] text-[#9DAFAC]/50 font-mono">{docGroups.length}</span>
                </div>
                {docGroups.map((group) => {
                  const allSelected = group.documentIds.length > 0 && group.documentIds.every((did) => selectedDocs.has(did));
                  return (
                    <div key={group.id}
                      className={`group flex items-center gap-2 px-2.5 py-2.5 sm:py-2 rounded-xl text-sm transition-[colors] duration-300 cursor-pointer ${
                        sidebarDragOverGroup === group.id
                          ? "bg-[#3B82F6]/10 border border-[#3B82F6]/30"
                          : "hover:bg-white/[0.03]"
                      }`}
                      onClick={() => toggleGroupSelection(group)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setSidebarDragOverGroup(group.id); }}
                      onDragEnter={(e) => { e.preventDefault(); setSidebarDragOverGroup(group.id); }}
                      onDragLeave={() => setSidebarDragOverGroup(null)}
                      onDrop={(e) => { e.preventDefault(); setSidebarDragOverGroup(null); const did = e.dataTransfer.getData("text/plain"); if (did) sidebarAddDocToGroup(group.id, did); }}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${allSelected ? "bg-[#3B82F6] border-[#3B82F6]" : "border-white/[0.15]"}`}>
                        {allSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <Folder size={14} className={`shrink-0 ${allSelected ? "text-[#3B82F6]" : "text-[#9DAFAC]/60"}`} />
                      <span className={`flex-1 min-w-0 truncate text-xs ${allSelected ? "text-white" : "text-[#9DAFAC]/70"}`}>{group.name}</span>
                      <span className="text-[10px] text-[#9DAFAC]/50 font-mono">{group.documentIds.length}</span>
                    </div>
                  );
                })}
                <div className="border-t border-white/[0.06] my-2" />
              </div>
            )}
            <div className="space-y-0.5">
              {docsLoading ? (
                <DocListSkeleton />
              ) : dedupedDocs.length === 0 ? (
                <OnboardingEmpty variant="no-docs" onAction={() => fileInput.current?.click()} />
              ) : (
                <>
                  {dedupedDocs.length >= 5 && (
                    <div className="px-1 pt-1 pb-1.5">
                      <div className="flex items-center gap-2 px-2.5 h-7 rounded-lg bg-white/[0.03] border border-white/[0.04] focus-within:border-white/[0.1]">
                        <MagnifyingGlass size={11} className="text-white/30 shrink-0" />
                        <input
                          value={docSearch}
                          onChange={(e) => setDocSearch(e.target.value)}
                          placeholder="Filter documents..."
                          className="flex-1 min-w-0 bg-transparent text-[11px] text-white placeholder:text-white/30 outline-none"
                        />
                        {docSearch && (
                          <button onClick={() => setDocSearch("")} aria-label="Clear" className="text-white/30 hover:text-white/60">
                            <XCircle size={11} weight="fill" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {docSearch && filteredDocs.length === 0 && (
                    <OnboardingEmpty variant="no-search-results" searchQuery={docSearch} />
                  )}
                  {filteredDocs.map((doc) => {
                    const did = doc.document_id ?? doc.id;
                    const name = docDisplayName(doc);
                    const ext = docExt(name);
                    const statusKey = docStatusKey(doc);
                    const pill = DOC_STATUS_PILL[statusKey];
                    const isSelected = selectedDocs.has(did);
                    return (
                      <div key={did}
                        draggable
                        onDragStart={(e) => sidebarHandleDragStart(e, did)}
                        title={name}
                        className="group flex items-center gap-2 px-2.5 py-3 md:py-2 rounded-xl text-sm hover:bg-white/[0.03] transition-[colors] duration-200 cursor-pointer active:bg-white/[0.05]"
                        onClick={() => toggleDoc(did)}
                      >
                        <div className={`w-4 h-4 md:w-4 md:h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-[#3B82F6] border-[#3B82F6]" : "border-white/[0.15]"}`}>
                          {isSelected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <FileText size={14} className={`shrink-0 ${isSelected ? "text-[#3B82F6]" : "text-[#9DAFAC]/60"}`} />
                        <span className={`flex-1 min-w-0 truncate text-xs ${isSelected ? "text-white" : "text-[#9DAFAC]/70"}`}>{name}</span>
                        {statusKey === "processing" ? (
                          <Spinner size={10} className="animate-spin text-[#3B82F6] shrink-0" />
                        ) : (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${pill.cls}`}>
                            {ext ? `${ext} · ${pill.label}` : pill.label}
                          </span>
                        )}
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(did);
                        }}
                          disabled={deletingIds.has(did)}
                          className="w-6 h-6 rounded hover:bg-red-500/10 flex items-center justify-center text-[#9DAFAC]/50 hover:text-red-400 transition-[colors,opacity] shrink-0 opacity-60 md:opacity-0 group-hover:opacity-100 disabled:opacity-100 disabled:cursor-not-allowed"
                          title="Delete">
                          {deletingIds.has(did) ? <Spinner size={10} className="animate-spin" /> : <X size={11} />}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Profile section */}
        <div className="border-t border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/80 truncate leading-tight">{accountName}</p>
              <p className="text-[10px] text-[#9DAFAC]/50 truncate leading-tight">{tokensUsed.toLocaleString()} tokens</p>
            </div>
          </div>
          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#3B82F6]/70 hover:bg-white/[0.03] transition-colors">Admin Panel</Link>
          )}
          <Link to="/" className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9DAFAC]/50 hover:text-[#3B82F6] hover:bg-[#3B82F6]/5 transition-[colors] duration-300">
            <House size={13} />
            Home
          </Link>
          <button onClick={logoutAndReset}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9DAFAC]/50 hover:text-red-400 hover:bg-red-500/5 transition-[colors] duration-300"
          >
            <SignOut size={13} />
            Sign Out
          </button>
        </div>
      </motion.aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-w-0 relative contain-[layout]">
        {/* Video Background (hero only, lazy-mounted after idle) */}
        {showVideoBg && (
          <HeroVideo />
        )}
        {/* Futuristic background layers (hidden on mobile for performance) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none hidden md:block" aria-hidden="true">
          <div className="absolute -top-40 -right-40 w-[800px] h-[800px] rounded-full bg-[#3B82F6] opacity-[0.04]"
               style={{ filter: "blur(120px)" }} />
          <div className="absolute -bottom-40 -left-40 w-[700px] h-[700px] rounded-full bg-[#1E3A5F] opacity-[0.1]"
               style={{ filter: "blur(140px)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] rounded-full bg-[#3B82F6] opacity-[0.03]"
               style={{ filter: "blur(180px)" }} />
        </div>

        <input ref={fileInput} type="file" multiple accept=".pdf,.md,.txt,.docx" className="hidden" onChange={(e) => handleUpload(e.target.files)} />

        {/* ── Content Area ── */}
        <FileDropZone onFiles={onDropFiles} disabled={loading} className="flex-1 flex overflow-hidden relative">
          {/* Mobile sidebar toggle */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden fixed top-4 left-4 z-40 w-11 h-11 rounded-xl bg-white/[0.1] border border-white/[0.12] flex items-center justify-center text-white hover:bg-white/[0.18] transition-[colors] active:scale-90 shadow-lg shadow-black/30"
              aria-label="Open menu"
            >
              <List size={20} weight="bold" />
            </button>
          )}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
              <>
                {hasRealMessages ? (
                  /* ── Chat messages view ── */
                  <>
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-2 md:px-4 py-2 md:py-6 relative will-change-[scroll-position] [overscroll-behavior:contain]">
                      <div className="max-w-3xl mx-auto flex flex-col gap-2.5 md:gap-4">
                        <AnimatePresence initial={false}>
                          {messages.map((msg, idx) => (
                            <motion.div
                              key={msg.id}
                              initial={false}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ type: "spring", damping: 24, stiffness: 320, mass: 0.5, delay: idx === messages.length - 1 && firstScrollDoneRef.current ? 0.05 : 0 }}
                              className={`flex gap-2 md:gap-3 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                              <div className={`w-7 h-7 md:w-8 md:h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                msg.role === "assistant"
                                  ? "bg-white/[0.05] border border-white/[0.06] text-[#9DAFAC]"
                                  : "bg-gradient-to-br from-[#3B82F6] to-[#1E3A5F] text-white shadow-lg shadow-[#3B82F6]/20"
                              }`}>
                                {msg.role === "assistant" ? <Robot size={14} /> : <User size={14} />}
                              </div>
                              <div className={`flex-1 min-w-0 max-w-[88%] md:max-w-[85%] ${msg.role === "user" ? "text-right" : ""}`}>
                                {msg.role === "user" ? (
                                  <div className={`group relative inline-block px-3.5 md:px-4 py-2.5 md:py-3 text-sm leading-relaxed text-left rounded-[20px] ${
                                    editingMessageId === msg.id
                                      ? "bg-white/[0.06] border border-[#3B82F6]/30"
                                      : "bg-white/[0.04] border border-white/[0.06]"
                                  }`}>
                                    {editingMessageId === msg.id ? (
                                      <div className="space-y-2 min-w-[200px]">
                                        <textarea
                                          autoFocus
                                          value={editingMessageContent}
                                          onChange={(e) => setEditingMessageContent(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                              e.preventDefault();
                                              submitEditMessage(msg.id);
                                            } else if (e.key === "Escape") {
                                              setEditingMessageId(null);
                                            }
                                          }}
                                          rows={Math.min(6, Math.max(1, editingMessageContent.split("\n").length))}
                                          className="w-full bg-transparent border-none outline-none text-sm text-white resize-none"
                                        />
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => setEditingMessageId(null)}
                                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white/60 hover:text-white rounded transition-colors"
                                          >
                                            <XCircle size={12} /> Cancel
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => submitEditMessage(msg.id)}
                                            disabled={!editingMessageContent.trim()}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-white text-black font-semibold rounded hover:bg-white/90 disabled:opacity-40 transition-colors"
                                          >
                                            <Check size={12} weight="bold" /> Save & resubmit
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      msg.content
                                    )}
                                  </div>
                                ) : (
                                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-[20px] p-3 md:p-5 group/msg relative">
                                    <div className="text-sm leading-relaxed citation-area" data-msg-id={msg.id}>
                                      {msg.content ? (
                                        <DiffusingMarkdown content={msg.content} streaming={loading && msg.role === "assistant" && idx === messages.length - 1} />
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block animate-pulse" style={{ animationDelay: "0ms" }} />
                                          <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block animate-pulse" style={{ animationDelay: "150ms" }} />
                                          <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block animate-pulse" style={{ animationDelay: "300ms" }} />
                                        </span>
                                      )}
                                    </div>
                                    {msg.citations && msg.citations.length > 0 && (
                                      <div className="mt-3 flex flex-wrap gap-1.5">
                                        {msg.citations.map((c, i) => (
                                          <motion.button key={i}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.04 }}
                                            onClick={() => handleCitationClick(c)}
                                            className="inline-flex items-center gap-1.5 text-[11px] text-[#9DAFAC] hover:text-[#3B82F6] transition-colors py-1 px-2.5 rounded-full bg-white/[0.04] hover:bg-[#3B82F6]/10 ring-1 ring-white/[0.06] hover:ring-[#3B82F6]/30"
                                          >
                                            <Quotes size={10} />
                                            <span className="font-mono">[{i + 1}]</span>
                                            <span className="truncate max-w-[120px]">{c.source}</span>
                                            {c.page && c.page > 0 && <span className="text-[10px] text-[#9DAFAC]">p.{c.page}</span>}
                                          </motion.button>
                                        ))}
                                      </div>
                                    )}
                                    {msg.reasoning_path && msg.reasoning_path.length > 0 && msg.mode !== "black_box" && (
                                      <details className="mt-3 text-xs text-[#9DAFAC]/70">
                                        <summary className="cursor-pointer hover:text-[#9DAFAC] flex items-center gap-1.5">
                                          <WarningCircle size={12} /> Reasoning steps
                                        </summary>
                                        <ol className="mt-1.5 pl-4 space-y-0.5 list-decimal">
                                          {msg.reasoning_path.map((s, i) => <li key={i}>{s}</li>)}
                                        </ol>
                                      </details>
                                    )}
                                    {msg.verification && msg.mode !== "black_box" && (
                                      <div className="mt-3 p-3 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                                        <WarningCircle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                                        <span>{msg.verification}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.04]">
                                      {msg.tokens_used !== undefined && msg.tokens_used > 0 && (
                                        <span className="text-[11px] font-mono text-[#9DAFAC]/50">{msg.tokens_used} tokens</span>
                                      )}
                                      <div className="flex-1" />
                                      <MessageActions
                                        role={msg.role}
                                        content={msg.content}
                                        isStreaming={loading && idx === messages.length - 1 && !msg.content}
                                        feedback={msg.feedback}
                                        queryId={msg.query_id}
                                        onFeedback={(up) => msg.query_id && handleFeedback(msg.query_id, up)}
                                        onRegenerate={regenerateLast}
                                        onEdit={() => startEditMessage(msg.id, msg.content)}
                                        disabled={loading}
                                      />
                                    </div>
                                  </div>
                                )}
                                {msg.role === "user" && !editingMessageId && (
                                  <div className="mt-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MessageActions
                                      role={msg.role}
                                      content={msg.content}
                                      onEdit={() => startEditMessage(msg.id, msg.content)}
                                      disabled={loading}
                                    />
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        <div ref={messagesEnd} />
                      </div>
                    </div>

                    {/* Floating "scroll to latest" button — anchored to chat column,
                        not the scroll container, so it never overlaps the answer. */}
                    <ScrollToBottom scrollContainer={chatContainerRef} bottomRef={messagesEnd} />

                    {/* Glass divider */}
                    <div className="shrink-0 relative z-10 px-4">
                      <div className="max-w-3xl mx-auto h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                    </div>
                  </>
                ) : (
                  /* ── Copilot-style Hero View ── */
                    <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-5 py-10 md:py-8">
                    <div className="flex flex-col items-center justify-center max-w-2xl w-full mt-[-5vh] md:mt-0">

                      {/* Greeting */}
                      <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                        className="text-2xl sm:text-4xl font-bold text-white text-center leading-tight"
                      >
                        Hi there. What would you like to explore?
                      </motion.h1>
                      <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="text-xs sm:text-sm text-[#9DAFAC]/50 mt-2 text-center max-w-xs sm:max-w-none"
                      >
                        Upload documents and ask questions — AI-powered citations included.
                      </motion.p>

                      {/* Suggested prompts - ChatGPT-style pills */}
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                        className="flex flex-wrap items-center justify-center gap-2 mt-6 sm:mt-8 max-w-sm"
                      >
                        {[
                          "Summarize a document",
                          "Compare two reports",
                          "Extract key findings",
                          "Check compliance",
                        ].map((prompt, i) => (
                          <motion.button
                            key={prompt}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.2 + i * 0.04, duration: 0.25 }}
                            whileHover={{ y: -1, borderColor: "rgba(0,230,207,0.3)" }}
                            onClick={() => { setInput(prompt); setTimeout(() => handlePaperPlaneRight(), 50); }}
                            className="px-3.5 py-2 rounded-full text-[11px] sm:text-xs text-[#9DAFAC]/70 border border-white/[0.08] transition-[colors] duration-300 cursor-pointer active:scale-95"
                            style={{ background: "rgba(255,255,255,0.03)" }}
                          >
                            {prompt}
                          </motion.button>
                        ))}
                      </motion.div>
                    </div>
                  </div>
                )}

                {/* ── Prompt Input (ChatGPT-style bottom bar) ── */}
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  onSubmit={handlePaperPlaneRight}
                  className="shrink-0 relative z-10 px-2 md:px-4 pb-2 md:pb-4 pt-1.5 md:pt-3 safe-area-bottom"
                >
                  <div className="max-w-3xl mx-auto">
                    <AutoGrowTextarea
                      value={input}
                      onChange={setInput}
                      onSubmit={() => handlePaperPlaneRight()}
                      onStop={stopGeneration}
                      loading={loading}
                      placeholder={hasRealMessages ? "Ask a question about your documents..." : "Ask anything"}
                      leftSlot={
                        <motion.button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          disabled={loading}
                          whileTap={{ scale: 0.9 }}
                          aria-label="Attach files"
                          className="w-9 h-9 md:w-8 md:h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/80 transition-[colors] disabled:opacity-30"
                        >
                          <PaperPlaneRight size={16} className="rotate-45" weight="bold" />
                        </motion.button>
                      }
                      footerSlot={
                        <QueryControls
                          mode={queryMode}
                          onModeChange={setQueryMode}
                          maxCitations={maxCitations}
                          onMaxCitationsChange={setMaxCitations}
                          disabled={loading}
                        />
                      }
                    />
                    <p className="text-[10px] md:text-[11px] text-white/25 text-center mt-1.5 md:mt-2.5 px-2 leading-relaxed">
                      Responses cite sources. Verify important claims against original documents.
                    </p>
                  </div>
                </motion.form>
              </>
            </div>

          {/* ── Right overlay: Documents panel / PDF viewer ── */}
            {activePanel === "documents" && (
              <motion.aside
                key="docs-panel"
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                exit={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="w-full md:w-1/2 border-l border-white/[0.06] bg-[#070E0D] flex flex-col overflow-hidden shrink-0 min-w-0 relative z-20 will-change-[clip-path]"
              >
                <DocumentsPanel
                  docs={dedupedDocs}
                  groups={docGroups}
                  onGroupsChange={(g) => { setDocGroups(g); }}
                  onDocsDeleted={(ids) => {
                    const idSet = new Set(ids);
                    setDocs((p) => p.filter((d) => !idSet.has(d.document_id ?? d.id)));
                    setDocGroups((prev) => prev.map((g) => ({ ...g, documentIds: g.documentIds.filter((d) => !idSet.has(d)) })));
                    setSelectedDocs((p) => { const n = new Set(p); ids.forEach((id) => n.delete(id)); return n; });
                  }}
                  onClose={() => setActivePanel(null)}
                  onUpload={handleUpload}
                  onRefresh={loadDocs}
                  uploadProgress={uploadProgress}
                  uploading={uploading}
                />
              </motion.aside>
            )}
            {activePdf && (
              <div className="w-full md:w-1/2 border-l border-white/[0.06] bg-[#070E0D] flex flex-col overflow-hidden shrink-0 min-w-0 relative z-20">
                <DocumentViewer
                  docId={activePdf.docId}
                  citation={activePdf.citation}
                  page={activePdf.page}
                  cloudinaryUrl={activePdf.cloudinaryUrl}
                  onClose={() => { setActivePdf(null); }}
                />
              </div>
            )}
          </div>
        </FileDropZone>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        sessions={sessions}
        docs={dedupedDocs}
        onNewChat={() => { newChat(); }}
        onSwitchSession={(id) => {
          const s = sessions.find((x) => x.id === id);
          if (s) switchToSession(s);
        }}
        onDeleteSession={(id) => deleteSession(id)}
        onToggleDocsPanel={() => { setActivePanel(activePanel === "documents" ? null : "documents"); setActivePdf(null); }}
        onDeleteDoc={(id) => setConfirmDeleteId(id)}
        onUploadClick={() => fileInput.current?.click()}
        onSignOut={logoutAndReset}
        onCopyLast={copyLastAssistant}
        onRegenerateLast={regenerateLast}
        onStopStream={stopGeneration}
        isStreaming={loading}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this document?"
        description="This will permanently remove the document and its vectors. This cannot be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            handleDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
      />
    </div>
  );
}
