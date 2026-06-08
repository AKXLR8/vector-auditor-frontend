import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, ArrowsClockwise, PencilSimple, ThumbsUp, ThumbsDown } from "@phosphor-icons/react";
import { useState } from "react";
import { copyToClipboard } from "../lib/clipboard";
import toast from "react-hot-toast";

interface Props {
  role: "user" | "assistant";
  content: string;
  onRegenerate?: () => void;
  onEdit?: () => void;
  feedback?: boolean | null;
  queryId?: string;
  onFeedback?: (up: boolean) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function MessageActions({ role, content, onRegenerate, onEdit, feedback, queryId, onFeedback, disabled, isStreaming }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Copy failed");
    }
  };

  const isUser = role === "user";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className={`flex items-center gap-0.5 ${isUser ? "justify-end" : "justify-start"}`}
      >
        {!isUser && queryId && onFeedback && (
          <>
            <ActionButton
              label="Helpful"
              active={feedback === true}
              onClick={() => onFeedback(true)}
              disabled={disabled}
            >
              <ThumbsUp size={12} weight={feedback === true ? "fill" : "regular"} />
            </ActionButton>
            <ActionButton
              label="Not helpful"
              active={feedback === false}
              onClick={() => onFeedback(false)}
              disabled={disabled}
            >
              <ThumbsDown size={12} weight={feedback === false ? "fill" : "regular"} />
            </ActionButton>
            <Divider />
          </>
        )}
        <ActionButton label={copied ? "Copied" : "Copy"} onClick={handleCopy} disabled={!content || disabled}>
          {copied ? <Check size={12} weight="bold" className="text-emerald-400" /> : <Copy size={12} />}
        </ActionButton>
        {!isUser && onRegenerate && (
          <ActionButton label="Regenerate" onClick={onRegenerate} disabled={disabled || isStreaming}>
            <ArrowsClockwise size={12} />
          </ActionButton>
        )}
        {isUser && onEdit && (
          <ActionButton label="Edit" onClick={onEdit} disabled={disabled}>
            <PencilSimple size={12} />
          </ActionButton>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function ActionButton({ children, onClick, disabled, active, label }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-8 h-8 md:w-7 md:h-7 rounded-md transition-all active:scale-90 ${
        active
          ? "bg-white/10 text-white"
          : "text-white/40 hover:text-white hover:bg-white/[0.06]"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-3 w-px bg-white/10" />;
}
