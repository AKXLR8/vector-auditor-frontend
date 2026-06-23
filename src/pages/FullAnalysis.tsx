import { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import MarkdownRenderer from "../components/MarkdownRenderer";
import { useAuth } from "../context/AuthContext";
import LeftNavRail from "../components/dashboard/LeftNavRail";
import {
  Sparkle, Download, FileText, ArrowLeft,
} from "@phosphor-icons/react";
import type { DocumentAnalysis } from "../types";

function buildPrintHtml(title: string, content: string) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><style>
body{font-family:Inter,system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#1a1a1a;line-height:1.7}
h1{font-size:2rem;border-bottom:2px solid #3B82F6;padding-bottom:8px}
h2{font-size:1.3rem;margin-top:28px;color:#3B82F6}
h3{font-size:1.1rem;margin-top:20px}
p,li{font-size:0.95rem}
code{background:#f0f0f0;padding:1px 5px;border-radius:4px;font-size:0.85rem}
pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow-x:auto}
blockquote{border-left:3px solid #3B82F6;margin:12px 0;padding:4px 16px;color:#555}
hr{border:none;border-top:1px solid #ddd;margin:24px 0}
</style></head><body>
<h1>${title}</h1>
${content}
</body></html>`;
}

export default function FullAnalysis() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id || "";
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);
  const [content, setContent] = useState("");
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);

  useEffect(() => {
    const locState = location.state as { content?: string; analysis?: DocumentAnalysis } | null;
    if (locState?.content) {
      setContent(locState.content);
      setAnalysis(locState.analysis || null);
      setLoadedFromStorage(false);
    } else if (uid) {
      const saved = localStorage.getItem(`full_analysis_content_${uid}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.content) {
            setContent(parsed.content);
            setAnalysis(parsed.analysis || null);
            setLoadedFromStorage(true);
          }
        } catch { /* ignore */ }
      }
    }
  }, [location.state, uid]);
  const [exportOpen, setExportOpen] = useState(false);

  const docCount = analysis?.documents_analyzed?.length ?? 0;

  function exportAsPdf() {
    const title = `Full Paper Analysis${docCount > 0 ? ` (${docCount} document${docCount === 1 ? "" : "s"})` : ""}`;
    const win = window.open("", "_blank");
    if (!win) { return; }
    win.document.write(buildPrintHtml(title, content));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  function exportAsDocx() {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "full-paper-analysis.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  const sections = useMemo(() => {
    if (!content) return [];
    const parts = content.split(/(?=^## )/m).filter(Boolean);
    return parts.map((p) => {
      const lines = p.split("\n");
      const title = lines[0].replace(/^##\s+/, "").trim();
      const body = lines.slice(1).join("\n").trim();
      return { title, body };
    });
  }, [content]);

  const accountName = user?.username || user?.display_name || user?.email?.split("@")[0] || "User";

  return (
    <div className="h-screen flex overflow-hidden bg-[#090909] text-[#F2F2F2]">
      <LeftNavRail
        activeNav="analytics"
        onNavChange={(id) => {
          if (id === "chats" || id === "documents") navigate("/chat");
          if (id === "analytics") navigate("/analysis");
        }}
        onHome={() => navigate("/")}
        username={accountName}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 z-20 border-b border-white/[0.06] bg-[#090909]">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-[60px]">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-xl text-[11px] text-white/60 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer">
              <ArrowLeft size={12} /> Back
            </button>
            <span className="text-white/20">/</span>
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#3B82F6]">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Full Paper Analysis
            </span>
            <div className="flex-1" />
            <div className="relative">
              <button
                onClick={() => setExportOpen((o) => !o)}
                disabled={!content}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-xl text-[11px] text-white/60 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer disabled:opacity-40"
              >
                <Download size={12} /> Export
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute top-full right-0 mt-1 w-44 bg-[#0d0d10] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50 origin-top-right"
                  >
                    <button onClick={() => { exportAsPdf(); setExportOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] transition-colors text-xs text-white/80 text-left">
                      <Download size={12} /> Export as PDF
                    </button>
                    <button onClick={() => { exportAsDocx(); setExportOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] transition-colors text-xs text-white/80 text-left">
                      <FileText size={12} /> Export as Markdown
                    </button>
                  </motion.div>
                </>
              )}
            </div>
          </div>
        </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
          {!content ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                <Sparkle size={24} weight="bold" className="text-white/30" />
              </div>
              <h2 className="text-lg font-semibold text-white/80">No analysis to display</h2>
              <p className="text-sm text-white/40 mt-1 max-w-md">
                Run a document analysis first, then generate a full paper analysis from the results page.
              </p>
              <Link to="/analysis" className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8] hover:shadow-lg hover:shadow-[#3B82F6]/20 transition-all">
                Go to Analysis
              </Link>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Full Paper Analysis</h1>
                  {docCount > 0 && (
                    <p className="text-xs text-white/50 mt-1">{docCount} document{docCount === 1 ? "" : "s"} analyzed</p>
                  )}
                </div>
              </div>

              <div className="prose prose-invert max-w-none">
                {sections.length > 0 ? sections.map((section, i) => (
                  <div key={i} className="mb-8 pb-6 border-b border-white/[0.06] last:border-0">
                    {section.title && (
                      <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-5 rounded-full bg-[#3B82F6] shrink-0" />
                        {section.title}
                      </h2>
                    )}
                    <div className="text-sm leading-relaxed text-white/80">
                      <MarkdownRenderer>{section.body}</MarkdownRenderer>
                    </div>
                  </div>
                )) : (
                  <div className="text-sm leading-relaxed text-white/80">
                      <MarkdownRenderer>{content}</MarkdownRenderer>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-4 pb-8">
                <button
                  onClick={exportAsPdf}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8] hover:shadow-lg hover:shadow-[#3B82F6]/20 transition-all cursor-pointer"
                >
                  <Download size={14} /> Export as PDF
                </button>
                <button
                  onClick={exportAsDocx}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-xs font-semibold text-white border border-white/10 hover:bg-white/[0.05] transition-all cursor-pointer"
                >
                  <FileText size={14} /> Export as Markdown
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
