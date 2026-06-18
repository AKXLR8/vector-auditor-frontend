import { useState, useRef, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypePrism from "rehype-prism-plus";
import "prismjs/themes/prism-tomorrow.css";
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
import LeftNavRail from "../components/dashboard/LeftNavRail";
import ChatListPanel from "../components/dashboard/ChatListPanel";
import RightInfoPanel from "../components/dashboard/RightInfoPanel";
import { OnboardingEmpty } from "../components/OnboardingEmpty";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
  Spinner, Robot, WarningCircle,
  Folder, Check, XCircle,
  Sparkle, List,
} from "@phosphor-icons/react";

const GROUPS_KEY_PREFIX = "vector_doc_groups_";
const PINNED_KEY_PREFIX = "pinned_sessions_";
const DOCS_CACHE_PREFIX = "vector_docs_cache_";

function groupsKey(uid: string) {
  return `${GROUPS_KEY_PREFIX}${uid || "anon"}`;
}

function loadGroups(uid: string): DocGroup[] {
  try { const raw = localStorage.getItem(groupsKey(uid)); if (raw) return JSON.parse(raw); } catch { }
  return [];
}

function saveGroups(uid: string, groups: DocGroup[]) {
  try { localStorage.setItem(groupsKey(uid), JSON.stringify(groups)); } catch { }
}

function docsCacheKey(userId: string) {
  return `${DOCS_CACHE_PREFIX}${userId}`;
}

function loadCachedDocs(userId: string): Document[] | null {
  try {
    const raw = localStorage.getItem(docsCacheKey(userId));
    if (raw) return JSON.parse(raw) as Document[];
  } catch { }
  return null;
}

function saveCachedDocs(userId: string, docs: Document[]) {
  try { localStorage.setItem(docsCacheKey(userId), JSON.stringify(docs)); } catch { }
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

function deletedSessionsKey(userId: string) {
  return `deleted_sessions_${userId}`;
}
function loadDeletedSessions(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(deletedSessionsKey(userId));
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}
function saveDeletedSessions(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(deletedSessionsKey(userId), JSON.stringify(Array.from(ids)));
  } catch { /* storage full */ }
}

function deriveTitle(messages: Message[]): string {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) return "New Chat";
  const first = userMessages[0].content;
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
    (_, n1, n2) => {
      const idx = parseInt(n1 || n2, 10);
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
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypePrism, rehypeRaw]} components={components}>
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
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypePrism, rehypeRaw]} components={components}>
          {enrichCitations(oldText)}
        </Markdown>
      )}
      {newText && (
        <span className="diffuse-in">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypePrism, rehypeRaw]} components={components}>
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
      <code {...props} className={className + " text-xs leading-relaxed font-mono block"}>{children}</code>
    ) : (
      <code {...props} className="bg-[#0D1C1A] px-1.5 py-0.5 rounded text-xs font-mono text-[#3B82F6]">{children}</code>
    ),
  pre: ({ children, ...props }: any) => <pre {...props} className="bg-[#0d0d12] border border-[#1a1a2e] rounded-xl p-4 overflow-x-auto mb-3 text-xs font-mono [&>code]:!bg-transparent [&>code]:!p-0 [&>code]:!border-none">{children}</pre>,
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
  const [docGroups, setDocGroups] = useState<DocGroup[]>(() => loadGroups(uid));
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [sidebarDragOverGroup, setSidebarDragOverGroup] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("chats");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768
  );
  const sidebarForcedClosedRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, { stage: string; progress: number; error?: string }>>({});
  const [activePdf, setActivePdf] = useState<{ docId: string; citation: Citation; page: number; cloudinaryUrl?: string } | null>(null);
  const [activePanel, setActivePanel] = useState<"documents" | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const pendingUploadRef = useRef<File[] | null>(null);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);

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
  const [maxCitations, setMaxCitations] = useLocalStorage<number>("query_max_citations", 5);
  const [activeModel, setActiveModel] = useLocalStorage<string>("active_model", "mercury");

  const messagesEnd = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const activeModelRef = useRef(activeModel);
  activeModelRef.current = activeModel;
  const fileInput = useRef<HTMLInputElement>(null);
  const streamContentRef = useRef<Map<string, string>>(new Map());
  const handleCitationClickRef = useRef<(c: Citation) => void>(() => {});
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadStartedAtRef = useRef<Map<string, number>>(new Map());
  const uploadToDocRef = useRef<Map<string, string>>(new Map());
  const touchDragDocRef = useRef<string | null>(null);
  const overlayStateRef = useRef<string | null>(null);
  const sessionsRef = useRef<LocalSession[]>(sessions);
  sessionsRef.current = sessions;
  const sessionFetchTokenRef = useRef(0);
  const sessionCreateInflightRef = useRef<Set<string>>(new Set());
  const userLoadTokenRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [showHamburger, setShowHamburger] = useState(
    () => typeof window !== "undefined" ? window.innerWidth < 768 : true
  );
  useEffect(() => {
    if (sidebarOpen) {
      setShowHamburger(false);
    } else if (isMobile) {
      const t = setTimeout(() => setShowHamburger(true), 350);
      return () => clearTimeout(t);
    } else {
      setShowHamburger(true);
    }
  }, [sidebarOpen, isMobile]);
  const hasOverlay = activePdf !== null;
  useSwipeGesture({
    onSwipeRight: () => setSidebarOpen(true),
    onSwipeLeft: () => { if (sidebarOpen) setSidebarOpen(false); },
    threshold: 60,
    enabled: isMobile && !hasOverlay,
    edgeOnly: 40,
  });

  // Intercept browser back to close overlays before navigating
  useEffect(() => {
    const onPopState = () => {
      if (sidebarOpen) { setSidebarOpen(false); return; }
      if (activeNav === "documents") { setActiveNav("chats"); return; }
      if (activePdf) { setActivePdf(null); return; }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [sidebarOpen, activeNav, activePdf]);

  // Push history state once when any overlay opens so back closes it first
  useEffect(() => {
    const hasOverlay = sidebarOpen || !!activePdf;
    if (hasOverlay && !overlayStateRef.current) {
      overlayStateRef.current = "1";
      window.history.pushState(null, "");
    }
    if (!hasOverlay) overlayStateRef.current = null;
  }, [sidebarOpen, activePdf]);

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

  const displayName = user?.username || user?.display_name || user?.email?.split("@")[0] || "User";
  const tokensUsed = totalTokens(messages);
  const accountName = displayName;
  const subtitle = displayName;
  const hasRealMessages = messages.some((m) => m.role === "user");
  const showVideoBg = !hasRealMessages;

  useKeyboardShortcuts([
    { key: "k", meta: true, handler: () => setPaletteOpen((o) => !o), allowInInputs: true },
    { key: "k", ctrl: true, handler: () => setPaletteOpen((o) => !o), allowInInputs: true },
    { key: "/", meta: true, handler: () => fileInput.current?.click() },
    { key: "/", ctrl: true, handler: () => fileInput.current?.click() },
    { key: "n", meta: true, handler: () => newChat(), allowInInputs: true },
    { key: "n", ctrl: true, handler: () => newChat(), allowInInputs: true },
    { key: "Escape", handler: () => { if (paletteOpen) setPaletteOpen(false); if (activeNav === "documents") setActiveNav("chats"); if (activePdf) setActivePdf(null); } },
  ]);

  const onDropFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      pendingUploadRef.current = Array.from(files);
      setShowPrivacyDialog(true);
    }
  };

  const startUpload = (privacy: boolean) => {
    const files = pendingUploadRef.current;
    if (files && files.length > 0) {
      handleUpload(files, privacy);
      pendingUploadRef.current = null;
      setShowPrivacyDialog(false);
    }
  };

  // Deduplicate documents by sha256 (keep most recent per unique content)
  const dedupedDocs = useMemo(() => {
    const seen = new Set<string>();
    return docs.filter((d): d is Document => {
      if (!d) return false;
      const key = d.sha256 || d.document_id || d.id;
      if (!key || seen.has(key)) return false;
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

  const handleSelectWorkspace = useCallback((groupId: string | null) => {
    setActiveGroupId(groupId);
    if (groupId === null) {
      setSelectedDocs(new Set(dedupedDocs.map((d) => d.document_id ?? d.id)));
    } else {
      const group = docGroups.find((g) => g.id === groupId);
      if (group) {
        setSelectedDocs(new Set(group.documentIds));
      }
    }
  }, [dedupedDocs, docGroups]);

  const { refetch, notify } = useDocumentSync({
    enabled: !!uid,
    onDocs: (fresh) => {
      setDocs((prev) => {
        const serverIds = new Set(fresh.map((d) => d.document_id ?? d.id));
        const pending = prev.filter((d) => {
          const id = d.document_id ?? d.id;
          return d.status === "processing" && !serverIds.has(id);
        });
        const optPrivacy = new Map<string, boolean>();
        for (const d of prev) {
          const id = d.document_id ?? d.id;
          if (id && d.privacy) optPrivacy.set(id, true);
        }
        const merged = [
          ...pending,
          ...fresh.map((d) => {
            const id = d.document_id ?? d.id;
            return id && !d.privacy && optPrivacy.has(id)
              ? { ...d, privacy: true }
              : d;
          }),
        ];
        if (uid) saveCachedDocs(uid, merged);
        return merged;
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
  useEffect(() => { if (uid) saveGroups(uid, docGroups); }, [uid, docGroups]);

  // Persist docs to localStorage cache
  useEffect(() => { if (uid) saveCachedDocs(uid, docs); }, [uid, docs]);

  useEffect(() => {
    if (!uid) return;
    const myToken = ++userLoadTokenRef.current;
    const localSessions = loadSessions(uid);
    const deletedIds = loadDeletedSessions(uid);
    apiListSessions().then((serverSessions) => {
      if (myToken !== userLoadTokenRef.current) return;
      const merged: LocalSession[] = [];
      const seenIds = new Set<string>();
      for (const ss of serverSessions) {
        if (deletedIds.has(ss.id)) continue;
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
        if (!seenIds.has(ls.id) && !deletedIds.has(ls.id)) {
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
      const cached = loadCachedDocs(uid);
      if (cached && cached.length > 0) {
        setDocs(cached);
        setDocsLoading(false);
      }
      void refetch();
    }
  }, [uid, refetch]);

  useEffect(() => {
    const open = activePdf !== null;
    if (open && sidebarOpen) {
      sidebarForcedClosedRef.current = true;
      setSidebarOpen(false);
    } else if (!open && sidebarForcedClosedRef.current) {
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
      const msgs = messagesRef.current;
      const sid = activeSessionIdRef.current;
      const title = deriveTitle(msgs);
      setSessions((prev) => {
        const updated = prev.map((s) =>
          s.id === sid ? { ...s, messages: [...msgs], title } : s
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
    const sid = activeSessionId;
    const timer = setTimeout(() => {
      const current = sessionsRef.current.find((s) => s.id === sid);
      if (!current) return;
      const msgs = current.messages;
      const title = deriveTitle(msgs);
      apiUpdateSession(sid, { title }).catch(() => {});

      const synced = getSyncedSet(sid);
      for (const msg of msgs) {
        if (synced.has(msg.id)) continue;
        if (!msg.content) continue;
        apiAddMessage(sid, {
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
          persistSyncedSet(sid, synced);
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
      if (uid === "_pending" || TERMINAL_STAGES.has(entry.stage)) {
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
        if (uid === "_pending") continue;
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
    const deletedIds = loadDeletedSessions(uid);
    deletedIds.add(id);
    saveDeletedSessions(uid, deletedIds);
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
    apiDeleteSession(id).catch(() => {
      toast.error("Failed to delete chat on server — it may reappear on reload.");
    });
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
        .filter((m) => m.id !== "welcome" && (!opts.assistantIdToReplace || m.id !== opts.regenOfMessageId))
        .map((m) => ({ role: m.role, content: m.content }));

      const req = {
        question: queryText,
        document_ids: selectedDocs.size > 0 ? Array.from(selectedDocs) : undefined,
        conversation_history: historyMessages.slice(-10),
        mode: queryMode,
        model: activeModelRef.current,
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
      if (messages[i].role === "user" && messages[i].id !== "welcome") {
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
    setSessions((p) => {
      const updated = p.map((s) => s.id === id ? { ...s, title: trimmed } : s);
      saveSessions(uid, updated);
      return updated;
    });
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

  const handleUpload = async (files: File[] | null, privacy = false) => {
    if (!files?.length) return;
    const fileCount = files.length;
    setUploading(true);
    setUploadProgress((prev) => ({
      ...prev,
      _pending: { stage: "uploading", progress: 0 },
    }));
    try {
      const res = await uploadDocuments(files, privacy);
      const uploaded = res?.uploaded_documents;
      if (!Array.isArray(uploaded)) {
        toast.error("Unexpected server response");
        return;
      }
      const progressMap: Record<string, { stage: string; progress: number }> = {};
      const optimistic: Document[] = [];
      const now = Date.now();
      let duplicates = 0;
      let willTrack = 0;
      for (const item of uploaded) {
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
          privacy,
          sha256: "",
          uploaded_by: uid,
          created_at: new Date().toISOString(),
        });
        willTrack += 1;
      }
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next._pending;
        return { ...next, ...progressMap };
      });
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
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next._pending;
        return next;
      });
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
    const lastMsg = session.messages.filter((m) => m.role === "user").pop();
    const preview = lastMsg
      ? lastMsg.content.length > 50
        ? lastMsg.content.slice(0, 50) + "..."
        : lastMsg.content
      : "No messages yet";
    const time = session.createdAt
      ? new Date(session.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    return (
      <div
        key={session.id}
        onClick={() => { switchToSession(session); if (isMobile) setSidebarOpen(false); }}
        className={`group flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all duration-150 ${
          isActive
            ? "bg-[rgba(59,130,246,0.06)] border border-[rgba(59,130,246,0.08)]"
            : "hover:bg-[rgba(255,255,255,0.03)] border border-transparent"
        }`}
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-sm ${
          session.title.toLowerCase().includes("nda")
            ? "bg-red-500/15 text-red-400"
            : session.title.toLowerCase().includes("contract") || session.title.toLowerCase().includes("risk")
            ? "bg-amber-500/15 text-amber-400"
            : session.title.toLowerCase().includes("research")
            ? "bg-blue-500/15 text-blue-400"
            : session.title.toLowerCase().includes("hr") || session.title.toLowerCase().includes("policy")
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-[#151515] text-[#6B7280]"
        }`}>
          {session.title.slice(0, 2).toUpperCase()}
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${isActive ? "text-white font-medium" : "text-[#D1D5DB]"}`}>
              {session.title}
            </span>
            <span className="text-[10px] text-[#6B7280] shrink-0">{time}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-[#6B7280] truncate flex-1">{preview}</span>
            {isPinned && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#6B7280" className="shrink-0">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            )}
          </div>
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
    <div className="h-screen flex overflow-hidden bg-[#090909] text-[#F2F2F2]">
      {/* Left Nav Rail */}
      <LeftNavRail
        activeNav={activeNav}
        onNavChange={(id) => {
          setActiveNav(id);
          if (id === "documents") {
            setActivePdf(null);
          } else if (id === "analytics") {
            navigate("/analysis");
          }
        }}
        onAddCollection={() => setActiveNav("documents")}
        username={accountName}
      />

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

      {activeNav === "documents" ? (
        /* ── Immersive Document Library View ── */
        <div className="flex-1 flex min-w-0 relative bg-[#090909]">
          <div className="flex-1 flex overflow-hidden">
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
              onClose={() => setActiveNav("chats")}
              onUpload={(files) => { if (files?.length) { pendingUploadRef.current = Array.from(files); setShowPrivacyDialog(true); } }}
              onRefresh={loadDocs}
              uploadProgress={uploadProgress}
              uploading={uploading}
            />
            {activePdf && (
              <div className="hidden md:block w-1/2 border-l border-white/[0.06] bg-[#090909] flex-col overflow-hidden shrink-0 min-w-0">
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
        </div>
      ) : (
        /* ── Chat View ── */
        <>
          {/* Chat List Panel — desktop always visible, mobile slide-over */}
          <div
            className={`fixed md:relative top-0 left-0 bottom-0 z-30 transition-all duration-200 ease-out md:translate-x-0 ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } ${activePdf ? "md:invisible md:opacity-0 md:pointer-events-none" : ""}`}
          >
            <ChatListPanel
              sessions={sessions}
              filteredSessions={filteredSessions}
              pinnedSessions={pinnedSessions}
              otherSessions={otherSessions}
              activeSessionId={activeSessionId}
              chatSearch={chatSearch}
              onChatSearch={setChatSearch}
              onNewChat={() => { newChat(); if (isMobile) setSidebarOpen(false); }}
              renderSessionRow={renderSessionRow}
            />
          </div>

      {/* ── Main Chat Area ── */}
      <main className="flex-1 flex min-w-0 relative">
        <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Static background gradient */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div
            className="w-full h-full"
            style={{
              background:
                "radial-gradient(ellipse at 50% 35%, rgba(59,130,246,0.03) 0%, transparent 60%), linear-gradient(180deg, #090909 0%, #0A0A0A 100%)",
            }}
          />
        </div>
        {/* Animated glow blobs — desktop only */}
        <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-40 -right-40 w-[800px] h-[800px] rounded-full bg-[#3B82F6] opacity-[0.02]"
               style={{ filter: "blur(120px)" }} />
          <div className="absolute -bottom-40 -left-40 w-[700px] h-[700px] rounded-full bg-[#3B82F6] opacity-[0.03]"
               style={{ filter: "blur(140px)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] rounded-full bg-[#3B82F6] opacity-[0.015]"
               style={{ filter: "blur(180px)" }} />
          <motion.div
            animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-[#3B82F6]/[0.02]"
            style={{ filter: "blur(80px)" }}
          />
          <motion.div
            animate={{ x: [0, -25, 20, 0], y: [0, 30, -15, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-1/3 left-1/4 w-[350px] h-[350px] rounded-full bg-[#3B82F6]/[0.04]"
            style={{ filter: "blur(100px)" }}
          />
        </div>

        <input ref={fileInput} type="file" multiple accept=".pdf,.md,.txt,.docx" className="hidden" onChange={(e) => { const fs = e.target.files; if (fs?.length) { pendingUploadRef.current = Array.from(fs); setShowPrivacyDialog(true); } e.target.value = ""; }} />

        {/* ── Content Area ── */}
        <FileDropZone onFiles={onDropFiles} disabled={loading} className="flex-1 flex overflow-hidden relative">
          {/* Mobile sidebar toggle */}
          {showHamburger && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              onClick={() => setSidebarOpen(true)}
              style={{
                top: "max(16px, env(safe-area-inset-top, 16px))",
                left: "max(16px, env(safe-area-inset-left, 16px))",
              }}
              className="md:hidden fixed z-40 w-11 h-11 rounded-xl bg-white/[0.1] border border-white/[0.12] flex items-center justify-center text-white hover:bg-white/[0.18] transition-[colors] active:scale-90 shadow-lg shadow-black/30"
              aria-label="Open menu"
            >
              <List size={20} weight="bold" />
            </motion.button>
          )}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
              <>
                {hasRealMessages ? (
                  /* ── Chat messages view ── */
                  <>
                    <div ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto px-2 md:px-4 py-2 md:py-6 relative will-change-[scroll-position] [overscroll-behavior:contain]">
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
                                        <div className="flex flex-col gap-2">
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block animate-pulse" style={{ animationDelay: "0ms" }} />
                                            <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block animate-pulse" style={{ animationDelay: "150ms" }} />
                                            <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block animate-pulse" style={{ animationDelay: "300ms" }} />
                                          </span>
                                          {loading && queryMode === "white_box" && (
                                            <p className="text-[11px] text-white/40 leading-relaxed animate-pulse">
                                              May take a while — using max reasoning on CPU hardware
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
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
                    <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-5 py-6 md:py-8 min-h-0">
                    <div className="flex flex-col items-center justify-center max-w-2xl w-full md:mt-[-5vh]">

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
                            onClick={() => { setInput(prompt); if (!loading) runQuery(prompt); }}
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

                {/* ── Mobile upload popup ── */}
                {(uploading || Object.keys(uploadProgress).length > 0) && (
                  <div className="md:hidden shrink-0 px-3 pt-2">
                    <div className="max-w-3xl mx-auto">
                      <div className="px-3 py-2 rounded-xl bg-[#0C1217] border border-white/[0.08] space-y-1 shadow-lg">
                        {(() => {
                          const entries = Object.entries(uploadProgress).filter(([k]) => k !== "_pending");
                          const completed = entries.filter(([, v]) => v.stage === "completed").length;
                          const failed = entries.filter(([, v]) => v.stage === "failed").length;
                          const avgProg = entries.length > 0
                            ? entries.reduce((s, [, v]) => s + v.progress, 0) / entries.length
                            : 0;
                          const pending = entries.filter(([, v]) => !TERMINAL_STAGES.has(v.stage)).length;
                          if (entries.length === 0 && !uploading) return null;
                          const label = uploadProgress._pending
                            ? "Starting upload..."
                            : failed > 0
                            ? `${failed} failed`
                            : pending > 0
                            ? `${pending} doc${pending > 1 ? "s" : ""} uploading`
                            : `${completed} done`;
                          const pct = uploadProgress._pending ? 0 : avgProg;
                          return (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-white/70">{label}</span>
                                <span className="text-white/40 font-mono">{Math.round(pct)}%</span>
                              </div>
                              <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
                                <motion.div
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: pct / 100 }}
                                  transition={{ duration: 0.5, ease: "easeOut" }}
                                  style={{ transformOrigin: "left" }}
                                  className={`h-full rounded-full will-change-[transform] ${
                                    failed > 0
                                      ? "bg-red-500"
                                      : pending === 0
                                      ? "bg-green-500"
                                      : "bg-gradient-to-r from-[#3B82F6] to-[#1E3A5F]"
                                  }`}
                                />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Doc/Group selection indicator ── */}
                {(selectedDocs.size > 0 || selectedGroups.size > 0) && (
                  <div className="shrink-0 px-2 md:px-4 pt-1">
                    <div className="max-w-3xl mx-auto flex items-center gap-1.5 flex-wrap">
                      {(() => {
                        const matchedGroup = docGroups.find(
                          (g) => g.documentIds.length > 0 && g.documentIds.every((did) => selectedDocs.has(did)) && selectedDocs.size === g.documentIds.length
                        );
                        if (matchedGroup) {
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-xs text-[#3B82F6]">
                              <Folder size={10} weight="fill" />
                              {matchedGroup.name}
                            </span>
                          );
                        }
                        const names = Array.from(selectedDocs)
                          .map((id) => dedupedDocs.find((d) => (d.document_id ?? d.id) === id))
                          .filter(Boolean) as Document[];
                        const maxVisible = 3;
                        return (
                          <>
                            {names.slice(0, maxVisible).map((doc) => (
                              <span key={doc.document_id ?? doc.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/70">
                                <FileText size={10} />
                                {doc.filename?.split("/").pop() || doc.document_id?.slice(0, 8) || "doc"}
                              </span>
                            ))}
                            {names.length > maxVisible && (
                              <span className="text-xs text-white/40">+{names.length - maxVisible} more</span>
                            )}
                          </>
                        );
                      })()}
                      <button
                        onClick={() => { setSelectedDocs(new Set()); setSelectedGroups(new Set()); }}
                        className="ml-auto text-xs text-white/30 hover:text-white/60 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Prompt Input (ChatGPT-style bottom bar) ── */}
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  onSubmit={handlePaperPlaneRight}
                  className="shrink-0 relative z-10 px-2 md:px-4 max-md:pb-4 md:pb-4 pt-1.5 md:pt-3 safe-area-bottom"
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
                        <div className="relative">
                          <motion.button
                            type="button"
                            onClick={() => setPlusOpen((p) => !p)}
                            disabled={loading}
                            whileTap={{ scale: 0.9 }}
                            aria-label="More actions"
                            className="w-9 h-9 md:w-8 md:h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/80 transition-[colors] disabled:opacity-30"
                          >
                            <Plus size={20} weight="bold" />
                          </motion.button>
                          <AnimatePresence>
                            {plusOpen && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setPlusOpen(false)} />
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9, y: 6 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.9, y: 6 }}
                                  transition={{ duration: 0.12 }}
                                  className="absolute bottom-full left-0 mb-1.5 flex flex-col gap-1 min-w-[140px] bg-[#0C1217] border border-white/[0.08] rounded-xl p-1 shadow-xl z-20"
                                >
                                  <button
                                    onClick={() => { fileInput.current?.click(); setPlusOpen(false); }}
                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-xs text-white/70 hover:text-white transition-colors text-left"
                                    title="Upload document"
                                  >
                                    <FileText size={13} />
                                    {dedupedDocs.length === 0 ? "Upload Document" : "Upload"}
                                  </button>
                                  <button
                                    onClick={() => { setActiveNav("documents"); setPlusOpen(false); }}
                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-xs text-white/70 hover:text-white transition-colors text-left"
                                  >
                                    <Folder size={13} />
                                    Create Group
                                  </button>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      }
                      footerSlot={
                        <QueryControls
                          mode={queryMode}
                          onModeChange={setQueryMode}
                          model={activeModel}
                          onModelChange={setActiveModel}
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

          {/* ── PDF viewer overlay ── */}
            {activePdf && (
              <div className="w-full md:w-[60%] border-l border-white/[0.06] bg-[#090909] flex flex-col overflow-hidden shrink-0 min-w-0 relative z-20">
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
        </div>
        <RightInfoPanel
          documents={dedupedDocs}
          selectedDocs={selectedDocs}
          onToggleDoc={toggleDoc}
          onSummarize={() => {
            if (selectedDocs.size === 0) { toast.error("Select at least one document"); return; }
            runQuery("Summarize the key points from the selected documents.");
          }}
          onCompare={() => {
            if (selectedDocs.size < 2) { toast.error("Select at least two documents to compare"); return; }
            runQuery("Compare the selected documents and highlight their key differences and similarities.");
          }}
          onGenerateReport={() => navigate("/analysis")}
          onExportCitations={() => {
            const citCount = messages.reduce((sum, m) => sum + (m.citations?.length || 0), 0);
            toast.success(`Exported ${citCount} citations`, { icon: "📋" });
          }}
        />
      </main>
      </>)}
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
        onToggleDocsPanel={() => { setActiveNav(activeNav === "documents" ? "chats" : "documents"); setActivePdf(null); }}
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

      {showPrivacyDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { setShowPrivacyDialog(false); pendingUploadRef.current = null; }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0C1217] border border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-black/60 max-w-sm w-full mx-4"
          >
            <h2 className="text-base font-semibold text-white text-center mb-1">Upload documents</h2>
            <p className="text-xs text-[#9DAFAC]/50 text-center mb-5">
              {(() => {
                const n = pendingUploadRef.current?.length ?? 0;
                return n === 1
                  ? `"${pendingUploadRef.current![0]!.name}" — set document privacy level`
                  : `${n} files — set document privacy level`;
              })()}
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => startUpload(false)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-[#3B82F6]/10 hover:border-[#3B82F6]/30 transition-all text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-[#3B82F6]/15 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                    <path d="M11 8v6" />
                    <path d="M8 11h6" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">Research</div>
                  <div className="text-[11px] text-[#9DAFAC]/50 mt-0.5">PII masking off — names and orgs stay searchable</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => startUpload(true)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">NDA</div>
                  <div className="text-[11px] text-[#9DAFAC]/50 mt-0.5">PII masking on — names and contact info removed</div>
                </div>
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setShowPrivacyDialog(false); pendingUploadRef.current = null; }}
              className="w-full mt-3 py-2 text-xs text-[#9DAFAC]/50 hover:text-white/70 transition-colors text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

