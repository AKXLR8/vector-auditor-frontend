import { motion } from "framer-motion";
import { FileText, Sparkle } from "@phosphor-icons/react";
import type { Document } from "../../types";

interface Props {
  documents: Document[];
  selectedDocs: Set<string>;
  onToggleDoc: (id: string) => void;
  onSummarize: () => void;
  onCompare: () => void;
  onGenerateReport: () => void;
  onExportCitations: () => void;
}

export default function RightInfoPanel({
  documents,
  selectedDocs,
  onToggleDoc,
  onSummarize,
  onCompare,
  onGenerateReport,
  onExportCitations,
}: Props) {
  const docCount = documents.length;
  const selCount = selectedDocs.size;

  return (
    <aside className="w-[300px] flex flex-col bg-[#090909] border-l border-[rgba(255,255,255,0.06)] shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 shrink-0 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Document Insights</h2>
        {selCount > 0 && (
          <span className="text-[10px] text-[#3B82F6] font-medium bg-[rgba(59,130,246,0.1)] px-2 py-0.5 rounded-full">
            {selCount} selected
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="px-5 py-4 space-y-3 border-b border-[rgba(255,255,255,0.06)]">
        <StatRow label="Documents" value={docCount.toString()} />
        <StatRow label="Selected" value={selCount.toString()} />
        <StatRow
          label="Processing"
          value={documents.filter((d) => d.status === "processing" || d.status === "queued").length.toString()}
        />
      </div>

      {/* Active Sources */}
      <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] uppercase tracking-widest text-[#6B7280] font-semibold">
            Documents
          </h3>
          {selCount > 0 && selCount < docCount && (
            <button
              onClick={() => documents.forEach((d) => {
                const did = d.document_id ?? d.id;
                if (!selectedDocs.has(did)) onToggleDoc(did);
              })}
              className="text-[10px] text-[#3B82F6] hover:text-white transition-colors"
            >
              Select all
            </button>
          )}
        </div>
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto scrollbar-thin">
          {documents.length === 0 ? (
            <p className="text-xs text-[#6B7280] px-1">No documents uploaded yet</p>
          ) : (
            documents.map((doc) => {
              const did = doc.document_id ?? doc.id;
              const isSelected = selectedDocs.has(did);
              const name = doc.filename || did.slice(0, 12);
              return (
                <motion.button
                  key={did}
                  onClick={() => onToggleDoc(did)}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl transition-all duration-150 text-left ${
                    isSelected
                      ? "bg-[rgba(59,130,246,0.06)] border border-[rgba(59,130,246,0.12)]"
                      : "bg-[#151515] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.1)]"
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? "bg-[#3B82F6] border-[#3B82F6]"
                        : "border-[rgba(255,255,255,0.15)]"
                    }`}
                  >
                    {isSelected && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#050505" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" stroke="#FFFFFF" />
                      </svg>
                    )}
                  </div>
                  {/* Icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelected ? "bg-[#3B82F6]/15" : "bg-[rgba(255,255,255,0.04)]"
                  }`}>
                    <FileText size={13} className={isSelected ? "text-[#3B82F6]" : "text-[#6B7280]"} />
                  </div>
                  {/* Name + badge */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs truncate block ${isSelected ? "text-white font-medium" : "text-[#D1D5DB]"}`}>
                      {name}
                    </span>
                    {doc.privacy && (
                      <span className="text-[9px] text-emerald-400/70 font-medium">NDA</span>
                    )}
                  </div>
                  {/* Status */}
                  {doc.status === "processing" && (
                    <Sparkle size={10} className="animate-spin text-[#6B7280]" />
                  )}
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-5 py-4">
        <h3 className="text-[11px] uppercase tracking-widest text-[#6B7280] font-semibold mb-3">Quick Actions</h3>
        <div className="space-y-1.5">
          <QuickActionBtn label="Summarize" icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" onClick={onSummarize} disabled={selCount === 0} />
          <QuickActionBtn label="Compare" icon="M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M16 21h5v-5M8 21H3v-5M21 21l-7-7M3 21l7-7" onClick={onCompare} disabled={selCount < 2} />
          <QuickActionBtn label="Generate Report" icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15l3-3 3 3" onClick={onGenerateReport} disabled={selCount === 0} />
          <QuickActionBtn label="Export Citations" icon="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 9l5 5 5-5 M12 4v10" onClick={onExportCitations} disabled={selCount === 0} />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-3 border-t border-[rgba(255,255,255,0.06)]">
        <p className="text-[10px] text-[#6B7280]">Vector Auditor v2.0</p>
      </div>
    </aside>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#6B7280]">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function QuickActionBtn({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <motion.button
      whileHover={disabled ? {} : { x: 3 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-sm transition-all duration-200 text-left ${
        disabled
          ? "bg-[#151515]/50 border-[rgba(255,255,255,0.03)] text-[#6B7280]/50 cursor-not-allowed"
          : "bg-[#151515] border-[rgba(255,255,255,0.06)] hover:border-[rgba(59,130,246,0.15)] text-[#D1D5DB] hover:text-white"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d={icon} />
      </svg>
      <span>{label}</span>
    </motion.button>
  );
}
