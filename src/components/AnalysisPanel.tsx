import { motion } from "framer-motion";
import { Quotes, FileText, WarningCircle, CheckCircle, MinusCircle, Sparkle } from "@phosphor-icons/react";
import type { DocumentAnalysis, Citation, AnalysisConfidence } from "../types";

interface Props {
  result: DocumentAnalysis;
  onCitationClick?: (c: Citation) => void;
}

const CONFIDENCE_META: Record<AnalysisConfidence, { label: string; cls: string; icon: any }> = {
  high: { label: "High confidence", cls: "bg-green-500/15 text-green-300 ring-green-500/30", icon: CheckCircle },
  moderate: { label: "Moderate confidence", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30", icon: MinusCircle },
  low: { label: "Low confidence", cls: "bg-red-500/15 text-red-300 ring-red-500/30", icon: WarningCircle },
};

function Section({
  title,
  icon: Icon,
  iconClass,
  children,
  delay = 0,
}: {
  title: string;
  icon: any;
  iconClass?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
    >
      <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2 mb-3">
        {Icon && <Icon size={15} weight="bold" className={iconClass || "text-[#60A5FA]"} />}
        <span>{title}</span>
      </h3>
      <div className="text-sm leading-relaxed text-white/80">{children}</div>
    </motion.section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs italic text-white/40">{text}</p>;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export function AnalysisPanel({ result, onCitationClick }: Props) {
  const conf = CONFIDENCE_META[result.confidence] ?? CONFIDENCE_META.moderate;
  const ConfIcon = conf.icon;

  return (
    <div className="space-y-3 max-w-3xl">
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <FileText size={16} weight="bold" className="text-[#60A5FA]" />
              Document Analysis
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              {result.documents_analyzed.length} document{result.documents_analyzed.length === 1 ? "" : "s"} analyzed
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ring-1 ${conf.cls}`}
          >
            <ConfIcon size={12} weight="bold" />
            {conf.label}
          </span>
        </div>
      </motion.header>

      <Section title="Summary" icon={Sparkle} iconClass="text-[#60A5FA]" delay={0.04}>
        <p className="whitespace-pre-wrap text-white/85">{result.summary || <Empty text="No summary returned." />}</p>
      </Section>

      <Section title="Key Findings" icon={Sparkle} iconClass="text-amber-300" delay={0.08}>
        {result.key_findings?.length ? (
          <ol className="list-decimal pl-5 space-y-1.5">
            {result.key_findings.map((f, i) => (
              <li key={i} className="text-white/85">
                {f}
              </li>
            ))}
          </ol>
        ) : (
          <Empty text="No key findings identified." />
        )}
      </Section>

      <Section title="Methodology" icon={Sparkle} iconClass="text-emerald-300" delay={0.12}>
        {result.methodology?.trim() ? (
          <p className="whitespace-pre-wrap text-white/85">{result.methodology}</p>
        ) : (
          <Empty text="Not discernible from the excerpts." />
        )}
      </Section>

      <Section title="Research Gaps" icon={WarningCircle} iconClass="text-orange-300" delay={0.16}>
        {result.research_gaps?.length ? (
          <ol className="list-decimal pl-5 space-y-1.5">
            {result.research_gaps.map((g, i) => (
              <li key={i} className="text-white/85">
                {g}
              </li>
            ))}
          </ol>
        ) : (
          <Empty text="No research gaps identified." />
        )}
      </Section>

      {result.contradictions && result.contradictions.length > 0 && (
        <Section title="Contradictions" icon={WarningCircle} iconClass="text-red-300" delay={0.2}>
          <ol className="list-decimal pl-5 space-y-1.5">
            {result.contradictions.map((c, i) => (
              <li key={i} className="text-white/85">
                {c}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title="Open Questions" icon={Sparkle} iconClass="text-cyan-300" delay={0.24}>
        {result.open_questions?.length ? (
          <ol className="list-decimal pl-5 space-y-1.5">
            {result.open_questions.map((q, i) => (
              <li key={i} className="text-white/85">
                {q}
              </li>
            ))}
          </ol>
        ) : (
          <Empty text="No open questions raised." />
        )}
      </Section>

      <Section title="Limitations" icon={WarningCircle} iconClass="text-yellow-300" delay={0.28}>
        {result.limitations?.trim() ? (
          <p className="whitespace-pre-wrap text-white/85">{result.limitations}</p>
        ) : (
          <Empty text="No limitations identified." />
        )}
      </Section>

      <Section title="Citations" icon={Quotes} iconClass="text-[#60A5FA]" delay={0.32}>
        {result.citations?.length ? (
          <ul className="space-y-2">
            {result.citations.map((c, i) => (
              <li
                key={i}
                className="citation-card group rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-[#3B82F6]/30 hover:bg-[#3B82F6]/5 transition-colors p-2.5"
              >
                <button
                  type="button"
                  onClick={() => onCitationClick?.(c)}
                  className="w-full text-left"
                  title="Open citation in document"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10.5px] text-[#60A5FA]">[{i + 1}]</span>
                    <span className="text-[11.5px] font-medium text-white/90 truncate">{c.source}</span>
                    {c.page && c.page > 0 && (
                      <span className="text-[10px] text-white/40 font-mono shrink-0">p.{c.page}</span>
                    )}
                    {c.location && (
                      <span className="text-[10px] text-white/40 truncate shrink min-w-0">{c.location}</span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-white/65 leading-relaxed italic line-clamp-3">
                    &ldquo;{truncate(c.quote, 280)}&rdquo;
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No citations returned." />
        )}
      </Section>

      {result.documents_analyzed?.length > 0 && (
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.36 }}
          className="text-[11px] text-white/40 pt-2 px-1"
        >
          Documents analyzed: {result.documents_analyzed.join(", ")}
        </motion.footer>
      )}
    </div>
  );
}
