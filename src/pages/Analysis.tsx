import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  FileText, House, SignOut, Sparkle, ArrowsClockwise,
  WarningCircle, Check, X, Spinner, CaretDown, MagnifyingGlass, ChatText,
  Robot, PaperPlaneRight, Quotes, CheckCircle, MinusCircle,
  Brain, BookOpen, Lightbulb, ArrowRight,
  CaretRight, Download,
} from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { analyzeDocuments, sendNexAGI } from "../api/query";
import { useDocumentSync } from "../hooks/useDocumentSync";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce } from "../hooks/useDebounce";
import Markdown from "react-markdown";
import { Skeleton } from "../components/Skeleton";
import { errorMessage } from "../lib/errors";
import type { Document, DocumentAnalysis, AnalysisConfidence } from "../types";

const FOCUS_KEY = "analysis_focus_topic";
const SELECTION_KEY_PREFIX = "analysis_doc_selection_";
const RESULT_KEY_PREFIX = "analysis_result_";

function scopedKey(prefix: string, uid: string) {
  return `${prefix}${uid || "anon"}`;
}

const CONFIDENCE_META: Record<AnalysisConfidence, { label: string; cls: string; icon: any }> = {
  high: { label: "High confidence", cls: "bg-green-500/15 text-green-300 ring-green-500/30", icon: CheckCircle },
  moderate: { label: "Moderate confidence", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30", icon: MinusCircle },
  low: { label: "Low confidence", cls: "bg-red-500/15 text-red-300 ring-red-500/30", icon: WarningCircle },
};

const ANALYSIS_CATEGORIES = [
  { icon: BookOpen, label: "Methodology", color: "text-emerald-300" },
  { icon: Lightbulb, label: "Results", color: "text-[#60A5FA]" },
  { icon: WarningCircle, label: "Gaps & Limitations", color: "text-orange-300" },
  { icon: Brain, label: "Contributions", color: "text-purple-300" },
  { icon: Quotes, label: "Citations & References", color: "text-cyan-300" },
];

function GlassCard({ children, className = "", ...props }: any) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

function ModelDropdown({ model, onChange, disabled }: { model: string; onChange: (m: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const MODELS = [
    { key: "mercury", label: "Mercury 2" },
    { key: "minimax", label: "Minimax M3 (NVIDIA)" },
  ];
  const current = MODELS.find((m) => m.key === model) ?? MODELS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-white/80 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all disabled:opacity-40 cursor-pointer"
      >
        <Robot size={13} className="text-[#60A5FA]" />
        <span>{current.label}</span>
        <CaretDown size={10} weight="bold" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full left-0 mb-1 min-w-[180px] bg-[#0d0d10] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-30 origin-bottom-left"
          >
            {MODELS.map((m) => {
              const selected = m.key === model;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { onChange(m.key); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors text-xs ${selected ? "bg-[#3B82F6]/10" : "hover:bg-white/[0.05]"}`}
                >
                  <Robot size={13} className="text-[#60A5FA] shrink-0" />
                  <span className="flex-1 text-white font-medium">{m.label}</span>
                  {selected && <Check size={10} weight="bold" className="text-[#3B82F6]" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Analysis() {
  const { user, logout: authLogout, loading: authLoading } = useAuth();
  const uid = user?.id || "";
  const navigate = useNavigate();

  const [docs, setDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useLocalStorage<string[]>(scopedKey(SELECTION_KEY_PREFIX, uid), []);
  const [focusTopic, setFocusTopic] = useLocalStorage<string>(FOCUS_KEY, "");
  const [activeModel, setActiveModel] = useLocalStorage<string>("active_model", "mercury");
  const [result, setResult] = useLocalStorage<DocumentAnalysis | null>(scopedKey(RESULT_KEY_PREFIX, uid), null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const debouncedDocSearch = useDebounce(docSearch, 120);

  const [chatQuery, setChatQuery] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

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
    try { await refetch(); } finally { setDocsLoading(false); }
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
    if (readyDocs.length === 0) { toast.error("Upload at least one document to analyze"); return; }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const allIds = readyDocs.map((d) => d.document_id ?? d.id).filter(Boolean) as string[];
      const docIds = selectedIds.length === 0 || selectedIds.length >= readyDocs.length ? allIds : selectedIds.filter((id) => allIds.includes(id));
      const body: { question?: string; document_ids: string[]; max_citations?: number; model?: string } = {
        document_ids: docIds, max_citations: 20, model: activeModel,
      };
      const trimmedFocus = focusTopic.trim();
      if (trimmedFocus) body.question = trimmedFocus;
      const data = await analyzeDocuments(body);
      setResult(data);
      setFocusTopic("key findings and research gaps");
      toast.success("Analysis complete");
    } catch (err) {
      const msg = errorMessage(err, "Could not analyze documents");
      setError(msg);
      toast.error(msg);
    } finally { setAnalyzing(false); }
  };

  /* ── Export helpers ── */
  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildMdReport(r: DocumentAnalysis) {
    const lines: string[] = [];
    lines.push("# Document Analysis Report");
    lines.push("");
    if (r.summary) { lines.push("## Summary"); lines.push(r.summary); lines.push(""); }
    if (r.key_findings?.length) {
      lines.push("## Key Findings");
      r.key_findings.forEach((f, i) => { lines.push(`${i + 1}. ${f}`); });
      lines.push("");
    }
    if (r.research_gaps?.length) {
      lines.push("## Research Gaps");
      r.research_gaps.forEach((g, i) => { lines.push(`${i + 1}. ${g}`); });
      lines.push("");
    }
    if (r.methodology) { lines.push("## Methodology"); lines.push(r.methodology); lines.push(""); }
    if (r.limitations) { lines.push("## Limitations"); lines.push(r.limitations); lines.push(""); }
    return lines.join("\n");
  }

  function exportAsMd() {
    if (!result) return;
    downloadFile(buildMdReport(result), "analysis-report.md", "text/markdown");
    toast.success("Markdown report downloaded");
  }

  function buildPrintHtml(r: DocumentAnalysis) {
    const items = (arr: string[] | undefined, tag: string) =>
      arr?.map((x) => `    <${tag}>${x}</${tag}>`).join("\n") ?? "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Analysis Report</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#111;line-height:1.6}
  h1{font-size:1.8rem;border-bottom:2px solid #2563EB;padding-bottom:8px}
  h2{font-size:1.3rem;margin-top:28px;color:#2563EB}
  ul{padding-left:20px}
  li{margin-bottom:4px}
  .meta{color:#666;font-size:0.9rem}
  .sep{border:none;border-top:1px solid #ddd;margin:24px 0}
</style></head><body>
<h1>Document Analysis Report</h1>
<p class="meta">${r.documents_analyzed.length} document(s) analyzed &mdash; Confidence: ${r.confidence}</p>
<hr class="sep">
<h2>Summary</h2><p>${r.summary}</p>
${r.key_findings?.length ? `<h2>Key Findings</h2><ol>${items(r.key_findings, "li")}</ol>` : ""}
${r.research_gaps?.length ? `<h2>Research Gaps</h2><ol>${items(r.research_gaps, "li")}</ol>` : ""}
${r.methodology ? `<h2>Methodology</h2><p>${r.methodology}</p>` : ""}
${r.limitations ? `<h2>Limitations</h2><p>${r.limitations}</p>` : ""}
</body></html>`;
  }

  function exportAsPdf() {
    if (!result) return;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup blocked. Allow popups for PDF export."); return; }
    win.document.write(buildPrintHtml(result));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  const handleChatSubmit = async (overrideMsg?: string) => {
    const question = (overrideMsg ?? chatQuery).trim();
    if (!question || chatLoading || !result) return;
    setChatQuery("");
    setChatMessages((p) => [...p, { role: "user", content: question }]);
    setChatLoading(true);
    try {
      const analysisContext = `Analysis summary: ${result.summary}\n\nKey findings: ${result.key_findings.join("\n")}\n\nResearch gaps: ${result.research_gaps.join("\n")}\n\nMethodology: ${result.methodology}\n\nLimitations: ${result.limitations}`;
      const answer = await sendNexAGI([
        { role: "user", content: `You are analyzing the following document analysis report:\n\n${analysisContext}` },
        ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ]);
      setChatMessages((p) => [...p, { role: "assistant", content: answer }]);
    } catch (err) {
      toast.error("Failed to get answer");
    } finally { setChatLoading(false); }
  };

  const accountName = user?.display_name || user?.username || user?.email?.split("@")[0] || "User";
  const conf = result ? CONFIDENCE_META[result.confidence] ?? CONFIDENCE_META.moderate : null;

  function countByCategory(items: string[], labels: string[]) {
    if (!items) return 0;
    const countMap: Record<string, number> = {};
    for (const item of items) {
      for (const label of labels) {
        if (item.toLowerCase().includes(label.toLowerCase())) {
          countMap[label] = (countMap[label] || 0) + 1;
          break;
        }
      }
    }
    return Object.keys(countMap).length || items.length;
  }

  const categoryCounts = useMemo(() => {
    if (!result) return [0, 0, 0, 0, 0];
    return [
      result.methodology ? Math.max(1, Math.round(result.methodology.split(/\.|\n/).filter(Boolean).length / 3)) : 0,
      result.key_findings?.length || 0,
      result.research_gaps?.length || 0,
      result.contradictions?.length || 0,
      result.citations?.length || 0,
    ];
  }, [result]);

  return (
    <div className="h-screen flex flex-col bg-[#050B16] text-[#F2F2F2] overflow-hidden">
      {/* ─── Top Nav ─── */}
      <header className="shrink-0 z-20 border-b border-white/[0.06] bg-[#050B16]/85 backdrop-blur-xl sticky top-0">
        <div className="flex items-center gap-2 px-4 sm:px-6 h-[70px]">
          <Link to="/chat" className="flex items-center shrink-0">
            <img src="/logo.png" alt="VecXAud" className="w-12 h-12 object-contain" />
          </Link>
          <span className="text-white/20 mx-1">/</span>
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80">
            <Sparkle size={14} weight="bold" className="text-[#2563EB]" />
            Analysis
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <Link to="/chat" className="inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/[0.05] transition-all" title="Chat">
              <ChatText size={13} /> <span className="hidden sm:inline">Chat</span>
            </Link>
            <Link to="/" className="inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/[0.05] transition-all" title="Home">
              <House size={13} /> <span className="hidden sm:inline">Home</span>
            </Link>
            <div className="hidden md:flex items-center gap-2 pl-2 ml-1 border-l border-white/[0.06]">
              <span className="text-xs text-white/50 truncate max-w-[120px]">{accountName}</span>
              <button onClick={() => { authLogout(); navigate("/"); }}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs text-white/50 hover:text-red-400 hover:bg-red-500/5 transition-all cursor-pointer">
                <SignOut size={13} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Three-column layout ─── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 sm:gap-6 p-3 sm:p-6 overflow-hidden">
        {/* ─── LEFT SIDEBAR (20%) ─── */}
        <aside className="flex lg:flex w-full lg:w-[20%] min-w-0 lg:min-w-[220px] shrink-0 flex-col max-h-[200px] lg:max-h-none">
          <GlassCard className="flex flex-col h-full overflow-hidden">
            <div className="px-4 pt-4 pb-2 shrink-0">
              <h2 className="text-sm font-semibold text-white">Documents</h2>
              <p className="text-[11px] text-white/50 mt-0.5">
                {docsLoading ? "Loading..." : `${readyDocs.length} document${readyDocs.length === 1 ? "" : "s"} available`}
              </p>
            </div>
            {readyDocs.length > 0 && (
              <div className="px-4 pb-2 flex items-center gap-3 shrink-0">
                <button onClick={toggleAll} className="text-[10.5px] text-[#2563EB] hover:text-[#60A5FA] transition-colors">
                  {allSelected ? "Deselect All" : "Select All"}
                </button>
                <span className="text-[10.5px] text-white/30">|</span>
                <span className="text-[10.5px] text-white/40">
                  {selectedIds.length === 0 || selectedIds.length === readyDocs.length
                    ? `All ${readyDocs.length}`
                    : `${selectedIds.length} selected`}
                </span>
              </div>
            )}
            {readyDocs.length >= 5 && (
              <div className="px-4 pb-2 shrink-0">
                <div className="flex items-center gap-2 px-2.5 h-7 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <MagnifyingGlass size={11} className="text-white/30 shrink-0" />
                  <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)} placeholder="Filter docs..." className="flex-1 min-w-0 bg-transparent text-[11px] text-white placeholder:text-white/30 outline-none" />
                  {docSearch && <button onClick={() => setDocSearch("")} className="text-white/30 hover:text-white/60"><X size={10} weight="fill" /></button>}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 scrollbar-thin">
              {docsLoading ? (
                <div className="space-y-1.5 px-1 py-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-2 rounded-xl">
                      <Skeleton className="h-4 w-4 shrink-0" rounded="rounded-md" />
                      <div className="flex-1 space-y-1"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-2 w-1/3" /></div>
                    </div>
                  ))}
                </div>
              ) : readyDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <FileText size={24} className="text-white/20 mb-2" />
                  <p className="text-xs text-white/40">No documents yet</p>
                  <Link to="/chat" className="text-[11px] text-[#2563EB] hover:text-[#60A5FA] mt-1">Upload from chat</Link>
                </div>
              ) : (
                filteredDocs.map((d) => {
                  const did = d.document_id ?? d.id;
                  const checked = selectedIds.length === 0 || selectedIds.includes(did);
                  const explicitlyChecked = selectedIds.includes(did);
                  return (
                    <label key={did} className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer text-sm transition-all ${
                      explicitlyChecked ? "bg-[#2563EB]/10 ring-1 ring-[#2563EB]/30" : "hover:bg-white/[0.04]"
                    }`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked ? "bg-[#2563EB] border-[#2563EB]" : "border-white/[0.15] group-hover:border-white/[0.3]"
                      }`}>
                        {checked && <Check size={10} weight="bold" className="text-white" />}
                      </span>
                      <input type="checkbox" className="sr-only" checked={explicitlyChecked} onChange={() => toggleOne(did)} />
                      <FileText size={13} className={`shrink-0 ${explicitlyChecked ? "text-[#60A5FA]" : "text-white/40"}`} />
                      <span className="flex-1 min-w-0 truncate text-xs text-white/80" title={d.filename}>{d.filename || "Untitled"}</span>
                      <span className="text-[9px] text-white/25 font-mono shrink-0 bg-white/[0.04] px-1 py-0.5 rounded">{d.filename?.split(".").pop()?.toLowerCase() ?? ""}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="shrink-0 px-3 pb-3 pt-1">
              <ModelDropdown model={activeModel} onChange={setActiveModel} disabled={analyzing} />
            </div>
          </GlassCard>
        </aside>

        {/* ─── MAIN CONTENT (50%) ─── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-y-auto gap-5">

          {/* Focus topic + Analyze */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <input
                value={focusTopic}
                onChange={(e) => setFocusTopic(e.target.value)}
                placeholder="Focus topic (optional) — e.g. methodology, limitations..."
                className="flex-1 h-9 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder:text-white/30 outline-none focus:border-[#2563EB]/40 transition-all"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAnalysis(); } }}
              />
              <button
                type="button"
                onClick={runAnalysis}
                disabled={analyzing || readyDocs.length === 0}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#1E3A5F] hover:shadow-lg hover:shadow-[#2563EB]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
              >
                <Sparkle size={13} weight="bold" />
                {analyzing ? "Analyzing..." : "Analyze"}
              </button>
            </div>
          </GlassCard>

          {/* Analysis results or empty / loading / error states */}
          <AnimatePresence mode="wait">
            {analyzing && (
              <motion.div key="analyzing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }}>
                <GlassCard className="p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Spinner size={14} className="animate-spin text-[#2563EB]" />
                    Analyzing {readyDocs.length} document{readyDocs.length === 1 ? "" : "s"}...
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-9/12" /><Skeleton className="h-3 w-7/12" /><Skeleton className="h-3 w-1/2" />
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {error && !analyzing && (
              <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }}>
                <GlassCard className="p-5 border-red-500/20 bg-red-500/5">
                  <div className="flex items-start gap-3">
                    <WarningCircle size={18} weight="bold" className="text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-red-200">Could not analyze</h3>
                      <p className="text-xs text-red-200/70 mt-1">{error}</p>
                      <button type="button" onClick={runAnalysis} className="inline-flex items-center gap-1.5 mt-3 h-7 px-2.5 rounded-md text-[11px] text-red-200 hover:text-white bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer">
                        <ArrowsClockwise size={11} weight="bold" /> Retry
                      </button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {result && !analyzing && (
              <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.35 }} className="space-y-3 sm:space-y-4">
                {/* Research Gaps & Key Findings */}
                <GlassCard className="p-4 sm:p-5">
                  <div className="space-y-1 mb-4">
                    <h1 className="text-xl font-semibold text-white tracking-tight">Research Gaps &amp; Key Findings</h1>
                    <p className="text-xs text-white/50 max-w-xl">
                      Get AI-structured research breakdowns of your documents — summary, methodology, gaps, contradictions, and open questions, all citation-backed.
                    </p>
                  </div>



                  {/* Analysis header card */}
                  <GlassCard className="p-3 sm:p-4 mb-3 sm:mb-4 bg-gradient-to-br from-white/[0.04] to-transparent">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 flex items-center justify-center">
                          <FileText size={16} className="text-[#2563EB]" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold text-white">Document Analysis</h2>
                          <p className="text-[11px] text-white/50">{result.documents_analyzed.length} document{result.documents_analyzed.length === 1 ? "" : "s"} analyzed</p>
                        </div>
                      </div>
                      {conf && (() => {
                        const ConfIcon = conf.icon;
                        return (
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ring-1 ${conf.cls}`}>
                            <ConfIcon size={12} weight="bold" /> {conf.label}
                          </span>
                        );
                      })()}
                    </div>
                  </GlassCard>

                  {/* Summary */}
                  <GlassCard className="p-4 mb-3">
                    <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2 mb-2">
                      <Sparkle size={14} weight="bold" className="text-[#2563EB]" /> Summary
                    </h3>
                    <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{result.summary}</p>
                  </GlassCard>

                  {/* Key Findings */}
                  <GlassCard className="p-4 mb-3">
                    <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2 mb-2">
                      <Lightbulb size={14} weight="bold" className="text-amber-300" /> Key Findings
                    </h3>
                    {result.key_findings?.length ? (
                      <ol className="space-y-2">
                        {result.key_findings.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-white/80 p-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            <span className="w-5 h-5 rounded-full bg-[#2563EB]/10 text-[#2563EB] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-xs italic text-white/40">No key findings identified.</p>
                    )}
                  </GlassCard>

                  {/* Research Gaps */}
                  {result.research_gaps?.length > 0 && (
                    <GlassCard className="p-4 mb-3">
                      <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2 mb-2">
                        <WarningCircle size={14} weight="bold" className="text-orange-300" /> Research Gaps
                      </h3>
                      <ol className="space-y-1.5">
                        {result.research_gaps.map((g, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-white/80 p-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            <span className="text-[10px] text-orange-300 font-mono mt-0.5 shrink-0">[{i + 1}]</span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ol>
                    </GlassCard>
                  )}

                  {/* Chat about analysis */}
                  <GlassCard className="p-4 mt-4 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                        <Brain size={14} weight="bold" className="text-purple-300" /> Ask about this analysis
                      </h3>
                      {chatMessages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setChatMessages([])}
                          className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/80 transition-colors cursor-pointer"
                        >
                          <X size={11} /> Clear
                        </button>
                      )}
                    </div>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto mb-3">
                      {chatMessages.length === 0 ? (
                        <p className="text-xs text-white/40 italic">Ask a follow-up question about the analysis results...</p>
                      ) : (
                        chatMessages.map((msg, i) => (
                          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                              msg.role === "user"
                                ? "bg-[#2563EB]/20 text-white/90 rounded-br-md"
                                : "bg-white/[0.04] text-white/80 rounded-bl-md"
                            }`}>
                              <Markdown>{msg.content}</Markdown>
                            </div>
                          </div>
                        ))
                      )}
                      {chatLoading && (
                        <div className="flex items-center gap-1.5 text-xs text-white/40">
                          <Spinner size={10} className="animate-spin" /> Thinking...
                        </div>
                      )}
                      <div ref={chatEnd} />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={chatQuery}
                        onChange={(e) => setChatQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }}
                        placeholder="Ask a follow-up..."
                        disabled={chatLoading}
                        className="flex-1 h-8 px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder:text-white/30 outline-none focus:border-[#2563EB]/40 disabled:opacity-40 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => handleChatSubmit()}
                        disabled={!chatQuery.trim() || chatLoading}
                        className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#2563EB]/80 transition-all cursor-pointer"
                      >
                        <PaperPlaneRight size={12} weight="bold" />
                      </button>
                    </div>
                  </GlassCard>
                </GlassCard>
              </motion.div>
            )}

            {!result && !analyzing && !error && (
              <motion.div key="empty" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <GlassCard className="p-6 sm:p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                    <Sparkle size={20} weight="bold" className="text-white/40" />
                  </div>
                  <h3 className="text-sm font-medium text-white/80">No analysis yet</h3>
                  <p className="text-xs text-white/45 mt-1 max-w-md mx-auto">
                    Type your question above and click <span className="text-white/70">Analyze</span> to get a structured research breakdown of your selected documents.
                  </p>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ─── RIGHT PANEL (30%) ─── */}
        <aside className="flex xl:flex w-full xl:w-[30%] min-w-0 xl:min-w-[260px] xl:max-w-[340px] shrink-0 flex-col gap-4 overflow-y-auto">
          {/* Paper Analysis Card */}
          <GlassCard className="p-4">
            <div className="w-1 h-10 w-full rounded-full bg-gradient-to-r from-purple-500 to-transparent mb-3" />
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <BookOpen size={14} className="text-purple-300" /> Research Paper Analysis
            </h2>
            <p className="text-[11px] text-white/50 mt-0.5 mb-4">Deep insights from your research papers</p>

            <div className="space-y-1.5">
              {ANALYSIS_CATEGORIES.map((cat, i) => {
                const CatIcon = cat.icon;
                const count = categoryCounts[i];
                const countLabel = ["findings", "insights", "gaps", "points", "citations"][i];
                return (
                  <div key={cat.label} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-default">
                    <CatIcon size={13} className={cat.color} />
                    <span className="flex-1 text-xs text-white/70">{cat.label}</span>
                    <span className="text-[11px] text-white/40 font-mono">{count} {countLabel}</span>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!result}
              onClick={() => { if (result) document.querySelector(".main-content")?.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="w-full mt-4 inline-flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#1E3A5F] hover:shadow-lg hover:shadow-[#2563EB]/20 disabled:opacity-40 transition-all cursor-pointer"
            >
              View Full Paper Analysis <ArrowRight size={12} weight="bold" />
            </button>
          </GlassCard>

          {/* Quick Actions */}
          <GlassCard className="p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Quick Actions</h2>
            <div className="space-y-1">
              <button
                type="button"
                disabled={!result || chatLoading}
                onClick={() => { handleChatSubmit("Generate concise key takeaways from this analysis"); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] hover:ring-1 hover:ring-white/[0.06] transition-all text-left cursor-pointer disabled:opacity-40"
              >
                <div className="w-7 h-7 rounded-lg bg-[#2563EB]/10 flex items-center justify-center shrink-0">
                  <Lightbulb size={13} className="text-amber-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white/80">Generate Key Takeaways</p>
                  <p className="text-[10px] text-white/40 truncate">Get concise key takeaways from the analysis</p>
                </div>
                <CaretRight size={12} className="text-white/30 shrink-0" />
              </button>
              <div className="relative" ref={exportRef}>
                <button
                  type="button"
                  disabled={!result}
                  onClick={() => setExportOpen((o) => !o)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] hover:ring-1 hover:ring-white/[0.06] transition-all text-left cursor-pointer disabled:opacity-40"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#2563EB]/10 flex items-center justify-center shrink-0">
                    <Download size={13} className="text-[#60A5FA]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/80">Export Analysis</p>
                    <p className="text-[10px] text-white/40 truncate">Download analysis report as PDF/Markdown</p>
                  </div>
                  <CaretDown size={10} weight="bold" className={`text-white/30 shrink-0 transition-transform ${exportOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {exportOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full left-0 mb-1 w-full bg-[#0d0d10] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-30 origin-bottom-left"
                    >
                      <button onClick={() => { exportAsPdf(); setExportOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] transition-colors text-xs text-white/80 text-left">
                        <Download size={12} /> Export as PDF
                      </button>
                      <button onClick={() => { exportAsMd(); setExportOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] transition-colors text-xs text-white/80 text-left">
                        <FileText size={12} /> Export as Markdown
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}
