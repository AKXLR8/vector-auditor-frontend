import { useState, useRef, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../context/AuthContext";
import DocumentViewer from "../components/DocumentViewer";
import DocumentsPanel from "../components/DocumentsPanel";
import { sendQuery, streamQuery, submitFeedback } from "../api/query";
import { listDocuments, uploadDocuments, getDocument, deleteDocument } from "../api/documents";
import { getUploadProgress } from "../api/uploads";
import {
  listSessions as apiListSessions,
  createSession as apiCreateSession,
  updateSession as apiUpdateSession,
  deleteSession as apiDeleteSession,
  addMessage as apiAddMessage,
  getSession as apiGetSession,
  listMessages as apiListMessages,
} from "../api/sessions";
import type { Document, Message, Citation, DocGroup, ChatSession as ServerSession, LocalSession } from "../types";
import {
  PaperPlaneRight, Plus, FileText, X,
  ThumbsUp, ThumbsDown, User, SignOut,
  Spinner, Robot, WarningCircle, ChatText,
  Quotes, MagnifyingGlass, House,
  Folder,
} from "@phosphor-icons/react";

const GROUPS_KEY = "vector_doc_groups";

function loadGroups(): DocGroup[] {
  try { const raw = localStorage.getItem(GROUPS_KEY); if (raw) return JSON.parse(raw); } catch { }
  return [];
}

function saveGroups(groups: DocGroup[]) {
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch { }
}

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content: "Upload documents, then ask me anything about them. I'll cite my sources.",
  timestamp: new Date().toISOString(),
};

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

function loadActiveId(userId: string): string | null {
  try { return localStorage.getItem(activeIdKey(userId)); } catch { return null; }
}
function saveActiveId(userId: string, id: string | null) {
  try { if (id) localStorage.setItem(activeIdKey(userId), id); else localStorage.removeItem(activeIdKey(userId)); } catch { /* ignore */ }
}

function enrichCitations(content: string): string {
  return content.replace(
    /【(\d+)(?:†[^】]*)?】|\[(\d+)\]/g,
    (match, jpIdx, bracketIdx) => {
      const idx = jpIdx || bracketIdx;
      return `<sup class="cit-chip" data-idx="${idx}"><button class="cit-chip-btn">[${idx}]</button></sup>`;
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
};

function DiffusingMarkdown({ content, streaming }: { content: string; streaming: boolean }) {
  const lastLen = useRef(0);
  if (!streaming) {
    lastLen.current = 0;
    return (
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[]} components={components}>
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
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[]} components={components}>
          {enrichCitations(oldText)}
        </Markdown>
      )}
      {newText && (
        <span className="diffuse-in">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[]} components={components}>
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
};

export default function Dashboard() {
  const { user, logout: authLogout, isAdmin, loading: authLoading } = useAuth();
  const uid = user?.id || "";
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [docGroups, setDocGroups] = useState<DocGroup[]>(loadGroups);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [sidebarDragOverGroup, setSidebarDragOverGroup] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, { stage: string; progress: number; error?: string }>>({});
  const [activePdf, setActivePdf] = useState<{ docId: string; citation: Citation; page: number } | null>(null);
  const [activePanel, setActivePanel] = useState<"documents" | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const fileInput = useRef<HTMLInputElement>(null);
  const streamContentRef = useRef<Map<string, string>>(new Map());
  const handleCitationClickRef = useRef<(c: Citation) => void>(() => {});
  const navigate = useNavigate();

  const tokensUsed = totalTokens(messages);
  const accountName = user?.display_name || user?.email?.split("@")[0] || "User";
  const subtitle = user?.display_name || user?.email?.split("@")[0] || "—";
  const hasRealMessages = messages.some((m) => m.role === "user");
  const showVideoBg = !hasRealMessages;

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

  const loadDocs = useCallback(() => {
    setDocsLoading(true);
    listDocuments().then((d) => { setDocs(d); setDocsLoading(false); }).catch(() => { setDocsLoading(false); toast.error("Failed to load documents"); });
  }, []);

  // Persist groups to localStorage
  useEffect(() => { saveGroups(docGroups); }, [docGroups]);

  useEffect(() => {
    loadDocs();
    const mq = window.matchMedia("(max-width: 768px)");
    setSidebarOpen(!mq.matches);
    // Load user-specific sessions from server + localStorage (server takes precedence)
    if (uid) {
      const localSessions = loadSessions(uid);
      // Load from server, merge with local
      apiListSessions().then((serverSessions) => {
        const merged: LocalSession[] = [];
        const seenIds = new Set<string>();
        // Server sessions first (they're the source of truth)
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
        // Add local-only sessions not yet on server
        for (const ls of localSessions) {
          if (!seenIds.has(ls.id)) {
            merged.push(ls);
            // Sync to server — pass the local ID so they match
            apiCreateSession(ls.title, ls.id).catch(() => {});
          }
        }
        setSessions(merged);
        saveSessions(uid, merged);
        // Restore active session
        const activeId = loadActiveId(uid);
        const session = merged.find((s) => s.id === activeId);
        if (session && session.messages.length > 0) {
          setActiveSessionId(activeId);
          setMessages(session.messages);
        } else if (activeId) {
          // Load messages from server for the active session
          apiGetSession(activeId).then((full) => {
            const serverMsgs = (full as any).messages || [];
            if (serverMsgs.length > 0) {
              const mapped: Message[] = serverMsgs.map((m: any) => ({
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
              setActiveSessionId(activeId);
              setMessages(mapped);
              // Update local session cache
              setSessions((prev) => {
                const upd = prev.map((s) =>
                  s.id === activeId ? { ...s, messages: mapped } : s
                );
                saveSessions(uid, upd);
                return upd;
              });
            }
          }).catch(() => {
            setActiveSessionId(null);
            setMessages([{ ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() }]);
          });
        } else {
          setActiveSessionId(null);
          setMessages([{ ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() }]);
        }
      }).catch(() => {
        // Fallback to localStorage only
        const loaded = loadSessions(uid);
        setSessions(loaded);
        const activeId = loadActiveId(uid);
        const session = loaded.find((s) => s.id === activeId);
        setActiveSessionId(activeId);
        setMessages(session?.messages?.length ? session.messages : [{ ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() }]);
      });
    }
  }, [user?.id]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-save to localStorage
  useEffect(() => {
    if (!activeSessionId) return;
    const title = deriveTitle(messages);
    setSessions((prev) => {
      const updated = prev.map((s) =>
        s.id === activeSessionId ? { ...s, messages: [...messages], title } : s
      );
      saveSessions(uid, updated);
      return updated;
    });
  }, [messages, activeSessionId, uid]);

  // Sync sessions to server in background (skip while streaming)
  useEffect(() => {
    if (!activeSessionId || !uid || loading) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const title = deriveTitle(session.messages);
    const timer = setTimeout(() => {
      apiUpdateSession(activeSessionId, { title }).catch(() => {});
      // Sync all messages that have query_id (completed assistant + user messages)
      const msgs = session.messages;
      const syncedIds = new Set<string>(
        JSON.parse(localStorage.getItem(`synced_msgs_${activeSessionId}`) || "[]")
      );
      for (const msg of msgs) {
        if (syncedIds.has(msg.id)) continue;
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
          syncedIds.add(msg.id);
          try { localStorage.setItem(`synced_msgs_${activeSessionId}`, JSON.stringify([...syncedIds])); } catch {}
        }).catch(() => {});
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [messages, activeSessionId, sessions, user?.id, loading]);

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

    // Schedule removal of completed/failed entries after 3s
    for (const [uid, entry] of Object.entries(uploadProgress)) {
      if (entry.stage === "failed" || entry.stage === "completed") {
        const timer = setTimeout(() => {
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[uid];
            return next;
          });
        }, 3000);
        timers.push(timer);
      }
    }

    const interval = setInterval(async () => {
      for (const uid of ids) {
        const entry = uploadProgress[uid];
        if (entry.stage === "completed" || entry.stage === "failed") continue;
        try {
          const p = await getUploadProgress(uid);
          setUploadProgress((prev) => ({
            ...prev,
            [uid]: { stage: p.stage, progress: p.progress, error: p.error || undefined },
          }));
          if (p.stage === "completed" || p.stage === "failed") {
            listDocuments().then(setDocs).catch(() => {});
          }
        } catch {
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[uid];
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
    const terminal = Object.values(uploadProgress).some(
      (p) => p.stage === "completed" || p.stage === "failed"
    );
    if (terminal) {
      listDocuments().then(setDocs).catch(() => {});
    }
  }, [uploadProgress]);

  const switchToSession = (session: LocalSession) => {
    setActiveSessionId(session.id);
    saveActiveId(uid, session.id);
    if (session.messages.length > 0) {
      setMessages(session.messages);
    } else {
      // Load messages from server
      apiGetSession(session.id).then((full) => {
        const serverMsgs = (full as any).messages || [];
        if (serverMsgs.length > 0) {
          const mapped: Message[] = serverMsgs.map((m: any) => ({
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
          setMessages(mapped);
          // Update local cache
          setSessions((prev) => {
            const upd = prev.map((s) =>
              s.id === session.id ? { ...s, messages: mapped } : s
            );
            saveSessions(uid, upd);
            return upd;
          });
        } else {
          setMessages([{ ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() }]);
        }
      }).catch(() => {
        setMessages([{ ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() }]);
      });
    }
  };

  const newChat = async () => {
    const id = crypto.randomUUID();
    const newSession: LocalSession = {
      id,
      title: "New Chat",
      messages: [{ ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() }],
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
    // Sync to server — pass the client ID so both stay in sync
    apiCreateSession("New Chat", id).catch(() => {});
    toast.success("New chat started");
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      saveSessions(uid, updated);
      return updated;
    });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      saveActiveId(uid, null);
      setMessages([{ ...WELCOME_MSG, id: "welcome-" + crypto.randomUUID(), timestamp: new Date().toISOString() }]);
    }
    apiDeleteSession(id).catch(() => {});
    toast.success("Chat deleted");
  };

  const handlePaperPlaneRight = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    setMessages((p) => [...p, userMsg, assistantPlaceholder]);
    setInput("");
    setLoading(true);

    const queryText = input.trim();

    try {
      // Build conversation history from current messages (exclude welcome messages)
      const historyMessages = messages
        .filter((m) => !m.id.startsWith("welcome-"))
        .map((m) => ({ role: m.role, content: m.content }));

      const req = {
        question: queryText,
        document_ids: selectedDocs.size > 0 ? Array.from(selectedDocs) : undefined,
        conversation_history: historyMessages.slice(-10), // last 10 turns for context
      };

      let citations: Citation[] | undefined;
      let reasoningPath: string[] | undefined;
      let verification: string | undefined;
      let queryId: string | undefined;
      let accumulated = "";

      streamContentRef.current.set(assistantId, "");

      for await (const event of streamQuery(req)) {
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
          verification = event.content;
        } else if (event.type === "gap_analysis") {
          accumulated += event.content || "";
          streamContentRef.current.set(assistantId, accumulated);
          setMessages((p) =>
            p.map((m) =>
              m.id === assistantId
                ? { ...m, content: accumulated, verification }
                : m
            )
          );
        } else if (event.type === "done") {
          queryId = event.query_id;
        }
      }

      // Finalize the message
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

      // Sync to server
      if (activeSessionId) {
        apiAddMessage(activeSessionId, {
          role: "user",
          content: queryText,
        }).catch(() => {});
        if (accumulated) {
          apiAddMessage(activeSessionId, {
            role: "assistant",
            content: accumulated,
            citations,
            reasoning_path: reasoningPath,
            query_id: queryId,
            verification,
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      setMessages((p) =>
        p.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `Error: ${err.response?.data?.detail || err.message || "Failed to get answer."}`,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      streamContentRef.current.delete(assistantId);
    }
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
      for (const item of res.uploaded_documents) {
        progressMap[item.upload_id] = { stage: "queued", progress: 0 };
      }
      setUploadProgress((prev) => ({ ...prev, ...progressMap }));
      toast.success(`Upload started — ${files.length} file${files.length > 1 ? "s" : ""} processing`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocs((p) => p.filter((d) => (d.document_id ?? d.id) !== id));
      setSelectedDocs((p) => { const n = new Set(p); n.delete(id); return n; });
      // Remove from all groups
      setDocGroups((prev) => prev.map((g) => ({ ...g, documentIds: g.documentIds.filter((d) => d !== id) })));
      toast.success("Document deleted");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Delete failed");
    }
  };

  const handleCitationClick = async (citation: Citation) => {
    const page = citation.page && citation.page > 0 ? citation.page : 1;
    setActivePdf({ docId: citation.source, citation, page });
    setActivePanel(null);
  };
  handleCitationClickRef.current = handleCitationClick;

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
            className="fixed inset-0 bg-black/60 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Unified Sidebar (Chats + Documents) ── */}
      <motion.aside
        animate={{ x: sidebarOpen ? 0 : -300 }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="fixed inset-y-0 left-0 z-30 w-[300px] flex flex-col overflow-hidden liquid-glass-sidebar"
        style={{ borderRight: "1px solid rgba(59,130,246,0.08)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-1 shrink-0">
          <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
          <span className="text-sm font-semibold tracking-tight text-white/80">Vector Auditor</span>
        </div>

        {/* Search */}
        <div className="px-3 pt-2 pb-2 shrink-0">
          <div className="flex items-center gap-2 px-3.5 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[#9DAFAC]/60 text-sm transition-all duration-300 focus-within:border-[#3B82F6]/30 focus-within:shadow-[0_0_16px_rgba(0,230,207,0.06)]">
            <MagnifyingGlass size={14} className="shrink-0" />
            <span className="flex-1 text-[#9DAFAC]/40">Search chats...</span>
          </div>
        </div>

        {/* Menu items */}
        <div className="px-3 space-y-0.5 shrink-0">
          <button onClick={newChat}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-white transition-all duration-300 active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #3B82F6, #1E3A5F)" }}
          >
            <Plus size={15} weight="bold" />
            New Chat
          </button>
        </div>

        <div className="px-3 py-2 shrink-0">
          <div className="border-t border-white/[0.06]" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
          {/* ── Chats section ── */}
          <div>
            <div className="flex items-center gap-2 px-1 py-1">
              <ChatText size={14} className="text-[#9DAFAC]/60" />
              <span className="flex-1 text-sm font-medium text-[#9DAFAC]/80">Chats</span>
            </div>
            {sessions.length === 0 && (
              <p className="text-xs text-[#9DAFAC]/40 text-center py-4">No chats yet</p>
            )}
            <div className="space-y-0.5">
              {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => switchToSession(session)}
                    className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 ml-1 ${
                      activeSessionId === session.id
                        ? "bg-white/[0.06] border border-white/[0.08]"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <span className={`flex-1 text-sm truncate ${activeSessionId === session.id ? "text-white" : "text-[#F2F2F2]/70"}`}>{session.title}</span>
                  <button onClick={(e) => deleteSession(session.id, e)}
                    className="w-6 h-6 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-[#9DAFAC]/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Documents section ── */}
          <div>
            <div className="flex items-center justify-between px-1 py-1">
              <button onClick={() => { setActivePanel("documents"); setActivePdf(null); }} className="flex items-center gap-1.5 text-sm font-medium text-[#9DAFAC]/80 hover:text-[#3B82F6] transition-all duration-300">
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
                        initial={{ width: 0 }}
                        animate={{ width: `${prog.progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className={`h-full rounded-full ${
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
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all duration-300 cursor-pointer ${
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
                <p className="text-xs text-[#9DAFAC]/40 text-center py-4 flex items-center justify-center gap-2"><Spinner size={12} className="animate-spin" /> Loading...</p>
              ) : dedupedDocs.length === 0 && (
                <p className="text-xs text-[#9DAFAC]/40 text-center py-4">No documents<br />
                  <button onClick={() => fileInput.current?.click()} className="text-[#3B82F6]/70 hover:text-[#3B82F6] transition-colors mt-1 inline-block">Upload one</button>
                </p>
              )}
              {dedupedDocs.map((doc) => {
                const did = doc.document_id ?? doc.id;
                const ext = doc.filename.split(".").pop()?.toLowerCase() || "";
                const isSelected = selectedDocs.has(did);
                return (
                  <div key={did}
                    draggable
                    onDragStart={(e) => sidebarHandleDragStart(e, did)}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm hover:bg-white/[0.03] transition-all duration-300 cursor-pointer"
                    onClick={() => toggleDoc(did)}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-[#3B82F6] border-[#3B82F6]" : "border-white/[0.15]"}`}>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <FileText size={14} className={`shrink-0 ${isSelected ? "text-[#3B82F6]" : "text-[#9DAFAC]/60"}`} />
                    <span className={`flex-1 min-w-0 truncate text-xs ${isSelected ? "text-white" : "text-[#9DAFAC]/70"}`}>{doc.filename}</span>
                    {doc.status === "success" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400/80 shrink-0">{ext}</span>
                    )}
                    {doc.status === "processing" && (
                      <Spinner size={10} className="animate-spin text-[#3B82F6] shrink-0" />
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(did); }}
                      className="w-5 h-5 rounded hover:bg-red-500/10 flex items-center justify-center text-[#9DAFAC]/30 hover:text-red-400 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                      title="Delete">
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Profile section */}
        <div className="border-t border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/80 truncate">{accountName}</p>
              <p className="text-[11px] text-[#9DAFAC]/50 truncate">{tokensUsed.toLocaleString()} tokens</p>
            </div>
          </div>
          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-2 px-3 py-2 text-xs text-[#3B82F6]/70 hover:bg-white/[0.03] transition-colors">Admin Panel</Link>
          )}
          <Link to="/" className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-[#9DAFAC]/50 hover:text-[#3B82F6] hover:bg-[#3B82F6]/5 transition-all duration-300">
            <House size={14} />
            Home
          </Link>
          <button onClick={logoutAndReset}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-[#9DAFAC]/50 hover:text-red-400 hover:bg-red-500/5 transition-all duration-300"
          >
            <SignOut size={14} />
            Sign Out
          </button>
        </div>
      </motion.aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Video Background (hero only) */}
        {showVideoBg && (
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <video autoPlay loop muted playsInline className="w-full h-full object-cover pointer-events-none scale-110" style={{ filter: "blur(4px) brightness(0.35)" }}>
              <source src="/video/upscaled-video.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-b from-[#070E0D]/40 via-transparent to-[#070E0D]/60" />
          </div>
        )}
        {/* Futuristic background layers */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-40 -right-40 w-[800px] h-[800px] rounded-full bg-[#3B82F6] opacity-[0.04]"
               style={{ filter: "blur(120px)" }} />
          <div className="absolute -bottom-40 -left-40 w-[700px] h-[700px] rounded-full bg-[#1E3A5F] opacity-[0.1]"
               style={{ filter: "blur(140px)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] rounded-full bg-[#3B82F6] opacity-[0.03]"
               style={{ filter: "blur(180px)" }} />
          {/* Animated glow blob */}
          <motion.div
            animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-[#3B82F6]/[0.03]"
            style={{ filter: "blur(80px)" }}
          />
          <motion.div
            animate={{ x: [0, -25, 20, 0], y: [0, 30, -15, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-1/3 left-1/4 w-[350px] h-[350px] rounded-full bg-[#1E3A5F]/[0.08]"
            style={{ filter: "blur(100px)" }}
          />
        </div>

        <input ref={fileInput} type="file" multiple accept=".pdf,.md,.txt,.docx" className="hidden" onChange={(e) => handleUpload(e.target.files)} />

        {/* ── Content Area ── */}
        <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
              <>
                {hasRealMessages ? (
                  /* ── Chat messages view ── */
                  <>
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-6">
                      <div className="max-w-3xl mx-auto space-y-4">
                        <AnimatePresence initial={false}>
                          {messages.map((msg, idx) => (
                            <motion.div
                              key={msg.id}
                              layout
                              initial={{ opacity: 0, y: 24, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ type: "spring", damping: 22, stiffness: 280, mass: 0.6, delay: idx === messages.length - 1 ? 0 : idx * 0.02 }}
                              className={`flex gap-3 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                msg.role === "assistant"
                                  ? "bg-white/[0.05] border border-white/[0.06] text-[#9DAFAC]"
                                  : "bg-gradient-to-br from-[#3B82F6] to-[#1E3A5F] text-white shadow-lg shadow-[#3B82F6]/20"
                              }`}>
                                {msg.role === "assistant" ? <Robot size={16} /> : <User size={16} />}
                              </div>
                              <div className={`flex-1 min-w-0 max-w-[85%] ${msg.role === "user" ? "text-right" : ""}`}>
                                {msg.role === "user" ? (
                                  <div className="inline-block px-4 py-3 text-sm leading-relaxed text-left rounded-[20px] bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
                                    {msg.content}
                                  </div>
                                ) : (
                                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-[20px] p-5 backdrop-blur-sm">
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
                                    {msg.reasoning_path && msg.reasoning_path.length > 0 && (
                                      <details className="mt-3 text-xs text-[#9DAFAC]/70">
                                        <summary className="cursor-pointer hover:text-[#9DAFAC] flex items-center gap-1.5">
                                          <WarningCircle size={12} /> Reasoning steps
                                        </summary>
                                        <ol className="mt-1.5 pl-4 space-y-0.5 list-decimal">
                                          {msg.reasoning_path.map((s, i) => <li key={i}>{s}</li>)}
                                        </ol>
                                      </details>
                                    )}
                                    {msg.verification && (
                                      <div className="mt-3 p-3 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                                        <WarningCircle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                                        <span>{msg.verification}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.04]">
                                      {msg.query_id && msg.feedback === null && (
                                        <div className="flex items-center gap-1">
                                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                                            onClick={() => handleFeedback(msg.query_id!, true)}
                                            className="w-7 h-7 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-[#9DAFAC] hover:text-green-400 transition-colors">
                                            <ThumbsUp size={13} />
                                          </motion.button>
                                          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                                            onClick={() => handleFeedback(msg.query_id!, false)}
                                            className="w-7 h-7 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-[#9DAFAC] hover:text-red-400 transition-colors">
                                            <ThumbsDown size={13} />
                                          </motion.button>
                                        </div>
                                      )}
                                      {msg.tokens_used !== undefined && msg.tokens_used > 0 && (
                                        <span className="text-[11px] font-mono text-[#9DAFAC]/50">{msg.tokens_used} tokens</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        <div ref={messagesEnd} />
                      </div>
                    </div>

                    {/* Glass divider */}
                    <div className="shrink-0 relative z-10 px-4">
                      <div className="max-w-3xl mx-auto h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                    </div>
                  </>
                ) : (
                  /* ── Copilot-style Hero View ── */
                  <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-4 py-8">
                    <div className="flex-1 flex flex-col items-center justify-center max-w-2xl w-full">

                      {/* Greeting */}
                      <motion.h1
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-3xl sm:text-4xl font-bold text-white text-center leading-tight"
                      >
                        Hi there. What would you like to explore?
                      </motion.h1>
                      <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.35 }}
                        className="text-sm text-[#9DAFAC]/50 mt-2 text-center"
                      >
                        Upload documents and ask questions — AI-powered citations included.
                      </motion.p>

                      {/* Suggested prompts - Copilot-style pills */}
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.5 }}
                        className="flex flex-wrap items-center justify-center gap-2 mt-8"
                      >
                        {[
                          "Summarize a document",
                          "Compare two reports",
                          "Extract key findings",
                          "Check compliance",
                        ].map((prompt, i) => (
                          <motion.button
                            key={prompt}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.6 + i * 0.08 }}
                            whileHover={{ y: -1, borderColor: "rgba(0,230,207,0.3)" }}
                            onClick={() => { setInput(prompt); }}
                            className="px-4 py-2 rounded-full text-xs text-[#9DAFAC]/70 border border-white/[0.08] transition-all duration-300 cursor-pointer"
                            style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)" }}
                          >
                            {prompt}
                          </motion.button>
                        ))}
                      </motion.div>
                    </div>
                  </div>
                )}

                {/* ── Prompt Input ── */}
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  onSubmit={handlePaperPlaneRight}
                  className="shrink-0 relative z-10 px-4 pb-4 pt-3"
                >
                  <div className="max-w-3xl mx-auto">
                    <div
                      className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-white/[0.08] transition-all duration-300 group focus-within:border-[#3B82F6]/30 focus-within:shadow-[0_0_30px_rgba(0,230,207,0.06)]"
                      style={{ background: "rgba(7,14,13,0.7)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
                    >
                      {/* Left actions */}
                      <motion.button
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.92 }}
                        type="button" onClick={() => fileInput.current?.click()}
                        disabled={loading}
                        className="w-8 h-8 rounded-xl hover:bg-white/[0.06] flex items-center justify-center text-[#9DAFAC]/40 hover:text-[#9DAFAC] transition-all shrink-0 disabled:opacity-30"
                        title="Attach files"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                      </motion.button>
                      <input
                        value={input} onChange={(e) => setInput(e.target.value)}
                        placeholder={hasRealMessages ? "Ask a question about your documents..." : "Type / for commands..."}
                        disabled={loading}
                        className="flex-1 bg-transparent border-none outline-none text-sm py-2.5 text-white placeholder-[#9DAFAC]/40 transition-all duration-300 focus:placeholder-[#9DAFAC]/60"
                      />

                      <div className="flex items-center gap-1">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.92 }}
                          type="submit" disabled={!input.trim() || loading}
                          className="w-9 h-9 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#1E3A5F] text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-[#3B82F6]/20 active:shadow-inner shrink-0"
                        >
                          <PaperPlaneRight size={14} weight="bold" />
                        </motion.button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#9DAFAC]/40 text-center mt-2.5">
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
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "50%", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="border-l border-white/[0.06] bg-[#070E0D] flex flex-col overflow-hidden shrink-0 min-w-0 relative z-20"
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
                  onRefresh={() => listDocuments().then(setDocs).catch(() => {})}
                  uploadProgress={uploadProgress}
                  uploading={uploading}
                />
              </motion.aside>
            )}
            {activePdf && (
              <div className="w-1/2 border-l border-white/[0.06] bg-[#070E0D] flex flex-col overflow-hidden shrink-0 min-w-0 relative z-20">
                <DocumentViewer
                  docId={activePdf.docId}
                  citation={activePdf.citation}
                  page={activePdf.page}
                  onClose={() => { setActivePdf(null); }}
                />
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
