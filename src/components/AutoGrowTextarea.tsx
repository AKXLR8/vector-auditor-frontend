import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  rows?: number;
  maxRows?: number;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
}

export function AutoGrowTextarea({
  value,
  onChange,
  onSubmit,
  onStop,
  placeholder,
  disabled,
  loading,
  rows = 1,
  maxRows = 8,
  leftSlot,
  rightSlot,
  footerSlot,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22;
    const maxHeight = lineHeight * maxRows + 18;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, [value, maxRows]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (loading) {
        onStop?.();
      } else if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  };

  const canSubmit = !disabled && value.trim().length > 0;

  return (
    <div
      className={`liquid-glass-input flex flex-col gap-1.5 px-3 py-2 transition-all duration-300 group ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      }`}
    >
      <div className="flex items-end gap-2">
        {leftSlot && <div className="shrink-0 pb-1">{leftSlot}</div>}
        <textarea
          ref={ref}
          value={value}
          rows={rows}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] py-1.5 px-1 text-white placeholder:text-white/35 resize-none leading-[22px] max-h-[180px] disabled:cursor-not-allowed transition-colors"
          style={{ height: "auto" }}
        />
        {rightSlot && <div className="shrink-0 pb-0.5">{rightSlot}</div>}
        <div className="shrink-0 pb-0.5">
          {loading && onStop ? (
            <motion.button
              type="button"
              onClick={onStop}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              aria-label="Stop generation"
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 active:shadow-inner transition-all shadow-[0_4px_14px_rgba(255,255,255,0.2)]"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="0" y="0" width="10" height="10" rx="1.5" />
              </svg>
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              whileHover={canSubmit ? { scale: 1.06 } : {}}
              whileTap={canSubmit ? { scale: 0.92 } : {}}
              aria-label="Send message"
              className="w-9 h-9 rounded-full bg-gradient-to-br from-[#60A5FA] via-[#3B82F6] to-[#1E3A5F] text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(59,130,246,0.35)] hover:shadow-[0_6px_20px_rgba(59,130,246,0.5)] active:shadow-inner"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </motion.button>
          )}
        </div>
      </div>
      {footerSlot && (
        <div className="relative flex items-center justify-between gap-2 pt-2 -mx-1 px-1">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent pointer-events-none" />
          {footerSlot}
        </div>
      )}
    </div>
  );
}
