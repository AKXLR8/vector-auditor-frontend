import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  FileText, House, SignOut, Sparkle, ArrowsClockwise,
  WarningCircle, Check, X, Spinner, CaretDown, MagnifyingGlass, ChatText,
} from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { analyzeDocuments } from "../api/query";
import { useDocumentSync } from "../hooks/useDocumentSync";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce } from "../hooks/useDebounce";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { OnboardingEmpty } from "../components/OnboardingEmpty";
import { Skeleton } from "../components/Skeleton";
import { errorMessage } from "../lib/errors";
import type { Document, DocumentAnalysis, Citation } from "../types";

const FOCUS_KEY = "analysis_focus_topic";
const SELECTION_KEY_PREFIX = "analysis_doc_selection_";

function selectionKey(uid: string) {
  return `${SELECTION_KEY_PREFIX}${uid || "anon"}`;
}

export default function Analysis() {
  const { user, logout: authLogout, loading: authLoading } = useAuth();
  const uid = user?.id || "";
  const navigate = useNavigate();

  const [docs, setDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useLocalStorage<string[]>(selectionKey(uid), []);
  const [focusTopic, setFocusTopic] = useLocalStorage<string>(FOCUS_KEY, "");
  const [maxCitations, setMaxCitations] = useLocalStorage<number>("query_max_citations", 20);

  const [result, setResult] = useLocalStorage<DocumentAnalysis | null>("analysis_result", null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<{ c: Citation; docId: string } | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const debouncedDocSearch = useDebounce(docSearch, 120);

  const { refetch } = useDocumentSync({
    enabled: !!uid,
    onDocs: (fresh) => {
      setDocs(fresh);
      setDocsLoading(false);
    },
    onError: () => {
      setDocsLoading(false);
      toast.error("Failed to load documents");
    },
  });

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      await refetch();
    } finally {
      setDocsLoading(false);
    }
  }, [refetch]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/login");
  }, [user, authLoading, navigate]);

  const readyDocs = useMemo(() => {
    const seen = new Set<string>();
    const out: Document[] = [];
    for (const d of docs) {
      const id = d.document_id ?? d.id;
      const key = (d as any).sha256 || id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
    return out;
  }, [docs]);

  const allSelected = readyDocs.length > 0 && selectedIds.length === readyDocs.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(readyDocs.map((d) => d.document_id ?? d.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filteredDocs = useMemo(() => {
    const q = debouncedDocSearch.trim().toLowerCase();
    if (!q) return readyDocs;
    return readyDocs.filter((d) => (d.filename || "").toLowerCase().includes(q));
  }, [readyDocs, debouncedDocSearch]);

  const runAnalysis = async () => {
    if (analyzing) return;
    if (readyDocs.length === 0) {
      toast.error("Upload at least one document to analyze");
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const allIds = readyDocs.map((d) => d.document_id ?? d.id).filter(Boolean) as string[];
      const docIds =
        selectedIds.length === 0 || selectedIds.length >= readyDocs.length
          ? allIds
          : selectedIds.filter((id) => allIds.includes(id));
      const body: { question?: string; document_ids: string[]; max_citations?: number } = {
        document_ids: docIds,
        max_citations: maxCitations,
      };
      const trimmedFocus = focusTopic.trim();
      if (trimmedFocus) body.question = trimmedFocus;
      const data = await analyzeDocuments(body);
      setResult(data);
    } catch (err) {
      const msg = errorMessage(err, "Could not analyze documents");
      setError(msg);
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const accountName = user?.display_name || user?.email?.split("@")[0] || "User";

  return (
    <div className="h-screen flex flex-col bg-[#070E0D] text-[#F2F2F2] overflow-hidden">
      <header className="shrink-0 z-20 border-b border-white/[0.06] bg-[#070E0D]/85 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-14">
          <Link to="/chat" className="inline-flex items-center gap-2 group" aria-label="Back to chat">
            <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
            <span className="text-sm font-semibold tracking-tight text-white/80 group-hover:text-white transition-colors hidden sm:inline">
              Vector Auditor
            </span>
          </Link>
          <span className="text-white/20">/</span>
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-white">
            <Sparkle size={14} weight="bold" className="text-[#60A5FA]" />
            Analysis
          </div>
          <div className="flex-1" />
          <Link
            to="/chat"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-all"
          >
            <ChatText size={13} />
            Chat
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-all"
          >
            <House size={13} />
            Home
          </Link>
          <div className="hidden md:flex items-center gap-2 pl-2 ml-1 border-l border-white/[0.06]">
            <span className="text-xs text-white/60 truncate max-w-[140px]">{accountName}</span>
            <button
              onClick={() => { authLogout(); navigate("/"); }}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs text-white/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
            >
              <SignOut size={13} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden md:flex w-[280px] xl:w-[320px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0c]/40">
          <div className="px-4 pt-4 pb-2 shrink-0">
            <h2 className="text-sm font-semibold text-white">Documents</h2>
            <p className="text-[11px] text-white/50 mt-0.5">
              {docsLoading ? "Loading..." : `${readyDocs.length} document${readyDocs.length === 1 ? "" : "s"} available`}
            </p>
          </div>
          {readyDocs.length >= 5 && (
            <div className="px-4 pb-2 shrink-0">
              <div className="flex items-center gap-2 px-2.5 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] focus-within:border-white/[0.12]">
                <MagnifyingGlass size={12} className="text-white/30 shrink-0" />
                <input
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Filter documents..."
                  className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-white/30 outline-none"
                />
                {docSearch && (
                  <button onClick={() => setDocSearch("")} aria-label="Clear" className="text-white/30 hover:text-white/60">
                    <X size={11} weight="fill" />
                  </button>
                )}
              </div>
            </div>
          )}
          {readyDocs.length > 0 && (
            <div className="px-4 pb-2 flex items-center gap-2 shrink-0">
              <button
                onClick={toggleAll}
                className="text-[10.5px] text-[#60A5FA] hover:text-[#93C5FD] transition-colors"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <span className="text-[10.5px] text-white/40">
                {selectedIds.length === 0 || selectedIds.length === readyDocs.length
                  ? "(analyze all)"
                  : `(${selectedIds.length} selected)`}
              </span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 scrollbar-thin">
            {docsLoading ? (
              <div className="space-y-1.5 px-1 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-2.5 rounded-xl">
                    <Skeleton className="h-4 w-4 shrink-0" rounded="rounded-md" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : readyDocs.length === 0 ? (
              <OnboardingEmpty variant="no-docs" onAction={() => navigate("/chat")} />
            ) : (
              filteredDocs.map((d) => {
                const did = d.document_id ?? d.id;
                const checked = selectedIds.length === 0 || selectedIds.includes(did);
                const explicitlyChecked = selectedIds.includes(did);
                return (
                  <label
                    key={did}
                    className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer text-sm transition-colors ${
                      explicitlyChecked ? "bg-[#3B82F6]/10 hover:bg-[#3B82F6]/15" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked ? "bg-[#3B82F6] border-[#3B82F6]" : "border-white/[0.15] group-hover:border-white/[0.3]"
                      }`}
                    >
                      {checked && (
                        <Check size={10} weight="bold" className="text-white" />
                      )}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={explicitlyChecked}
                      onChange={() => toggleOne(did)}
                    />
                    <FileText size={13} className={`shrink-0 ${explicitlyChecked ? "text-[#60A5FA]" : "text-white/50"}`} />
                    <span className="flex-1 min-w-0 truncate text-xs text-white/80" title={d.filename}>
                      {d.filename || "Untitled"}
                    </span>
                    <span className="text-[10px] text-white/30 font-mono shrink-0">
                      {d.filename?.split(".").pop()?.toLowerCase() ?? ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="space-y-1"
            >
              <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                Research Gaps &amp; Key Findings
              </h1>
              <p className="text-sm text-white/55 max-w-xl">
                Get a structured research breakdown of your documents — summary, methodology, gaps,
                contradictions, and open questions, all citation-backed.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5 space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-white/60" htmlFor="focus-topic">
                  Focus topic <span className="text-white/30">(optional)</span>
                </label>
                <input
                  id="focus-topic"
                  value={focusTopic}
                  onChange={(e) => setFocusTopic(e.target.value)}
                  placeholder='e.g. "methodology", "limitations", "findings about X"'
                  className="mt-1.5 w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 outline-none focus:border-[#3B82F6]/40 focus:bg-white/[0.06] transition-all"
                />
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[11.5px] text-white/45">
                  {readyDocs.length === 0
                    ? "Upload a document to begin"
                    : selectedIds.length === 0 || selectedIds.length === readyDocs.length
                    ? `Will analyze all ${readyDocs.length} document${readyDocs.length === 1 ? "" : "s"}`
                    : `Will analyze ${selectedIds.length} selected document${selectedIds.length === 1 ? "" : "s"}`}
                </div>
                <motion.button
                  type="button"
                  onClick={runAnalysis}
                  disabled={analyzing || readyDocs.length === 0}
                  whileHover={!analyzing && readyDocs.length > 0 ? { scale: 1.02 } : {}}
                  whileTap={!analyzing && readyDocs.length > 0 ? { scale: 0.97 } : {}}
                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#3B82F6] to-[#1E3A5F] hover:shadow-lg hover:shadow-[#3B82F6]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {analyzing ? (
                    <>
                      <Spinner size={14} className="animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkle size={14} weight="bold" />
                      Analyze
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              {analyzing && (
                <motion.div
                  key="analyzing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Spinner size={14} className="animate-spin text-[#60A5FA]" />
                    Analyzing {readyDocs.length} document{readyDocs.length === 1 ? "" : "s"}...
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-11/12" />
                    <Skeleton className="h-3 w-9/12" />
                    <Skeleton className="h-3 w-7/12" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </motion.div>
              )}

              {error && !analyzing && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <WarningCircle size={18} weight="bold" className="text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-red-200">Could not analyze</h3>
                      <p className="text-xs text-red-200/70 mt-1">{error}</p>
                      <button
                        type="button"
                        onClick={runAnalysis}
                        className="inline-flex items-center gap-1.5 mt-3 h-7 px-2.5 rounded-md text-[11px] text-red-200 hover:text-white bg-red-500/10 hover:bg-red-500/20 transition-colors"
                      >
                        <ArrowsClockwise size={11} weight="bold" /> Retry
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {result && !analyzing && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.35 }}
                >
                  <AnalysisPanel
                    result={result}
                    onCitationClick={(c) => setActiveCitation({ c, docId: c.source })}
                  />
                </motion.div>
              )}

              {!result && !analyzing && !error && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center"
                >
                  <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                    <Sparkle size={18} weight="bold" className="text-white/40" />
                  </div>
                  <h3 className="text-sm font-medium text-white/80">No analysis yet</h3>
                  <p className="text-xs text-white/45 mt-1 max-w-md mx-auto">
                    Pick a focus topic (or leave blank) and click <span className="text-white/70">Analyze</span> to get a structured
                    research breakdown of your selected documents.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {activeCitation && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch justify-end"
          onClick={() => setActiveCitation(null)}
        >
          <motion.div
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[60%] max-w-[820px] h-full bg-[#070E0D] border-l border-white/[0.08] flex flex-col"
          >
            <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06] shrink-0">
              <FileText size={14} className="text-[#60A5FA]" />
              <span className="text-sm font-medium truncate flex-1">{activeCitation.c.source}</span>
              <button
                onClick={() => setActiveCitation(null)}
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/60 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-[#0a0a0c] flex items-center justify-center text-xs text-white/40 p-8 text-center">
              <div>
                <p>Document viewer opens here.</p>
                <p className="mt-1 text-white/30">Citation context: &ldquo;{activeCitation.c.quote.slice(0, 120)}{activeCitation.c.quote.length > 120 ? "..." : ""}&rdquo;</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
