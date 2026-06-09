import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Lightning, CaretDown, Check, Minus, Plus } from "@phosphor-icons/react";
import type { QueryMode } from "../types";

interface ModeOption {
  value: QueryMode;
  label: string;
  description: string;
  icon: any;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "white_box",
    label: "Researcher",
    description: "Full reasoning, gap analysis, verification",
    icon: Brain,
  },
  {
    value: "black_box",
    label: "Direct",
    description: "Concise answer, no reasoning, no verification",
    icon: Lightning,
  },
];

interface Props {
  mode: QueryMode;
  onModeChange: (m: QueryMode) => void;
  maxCitations: number;
  onMaxCitationsChange: (n: number) => void;
  disabled?: boolean;
}

interface PopoverPos {
  left: number;
  bottom: number;
  minWidth: number;
}

export function QueryControls({ mode, onModeChange, maxCitations, onMaxCitationsChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const closeIfOutside = useCallback((e: MouseEvent | TouchEvent) => {
    if (!popoverRef.current || popoverRef.current.contains(e.target as Node)) return;
    if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("touchstart", closeIfOutside);
    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("touchstart", closeIfOutside);
    };
  }, [open, closeIfOutside]);

  const current = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0];
  const CurrentIcon = current.icon;

  const clamp = (n: number) => Math.max(1, Math.min(50, Math.round(n) || 20));

  const recalc = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 6;
    setPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + margin,
      minWidth: Math.max(rect.width, 240),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    recalc();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const popover = (
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={popoverRef}
          role="listbox"
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={{ duration: 0.12 }}
          style={{
            position: "fixed",
            left: pos.left,
            bottom: pos.bottom,
            minWidth: pos.minWidth,
            zIndex: 9999,
          }}
          className="bg-[#0d0d10] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
        >
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = opt.value === mode;
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onModeChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  selected ? "bg-[#3B82F6]/10" : "hover:bg-white/[0.05]"
                }`}
              >
                <Icon
                  size={14}
                  weight="bold"
                  className={`mt-0.5 shrink-0 ${opt.value === "white_box" ? "text-[#60A5FA]" : "text-amber-300"}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white">{opt.label}</div>
                  <div className="text-[10.5px] text-white/50 mt-0.5 leading-snug">{opt.description}</div>
                </div>
                {selected && <Check size={12} weight="bold" className="mt-0.5 text-[#3B82F6] shrink-0" />}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={
            mode === "white_box"
              ? "Researcher (white_box) — detailed reasoning, gap analysis, verification"
              : "Direct (black_box) — temperature 0, no reasoning, concise answer"
          }
          className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium transition-all border ${
            open
              ? "bg-white/[0.08] border-white/[0.12] text-white"
              : "bg-white/[0.03] border-white/[0.06] text-white/80 hover:bg-white/[0.06] hover:border-white/[0.1]"
          } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <CurrentIcon size={11} weight="bold" className={mode === "white_box" ? "text-[#60A5FA]" : "text-amber-300"} />
          <span>{current.label}</span>
          <CaretDown size={9} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div
        className="inline-flex items-center gap-1 h-6 px-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[11px] text-white/80"
        title="Max citations returned per query (1-50)"
      >
        <span className="text-white/50 pl-0.5">Citations</span>
        <button
          type="button"
          onClick={() => !disabled && onMaxCitationsChange(clamp(maxCitations - 1))}
          disabled={disabled || maxCitations <= 1}
          aria-label="Decrease max citations"
          className="w-4 h-4 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus size={9} weight="bold" />
        </button>
        <input
          type="number"
          min={1}
          max={50}
          step={1}
          value={maxCitations}
          disabled={disabled}
          onChange={(e) => onMaxCitationsChange(clamp(parseInt(e.target.value, 10)))}
          onBlur={(e) => onMaxCitationsChange(clamp(parseInt(e.target.value, 10)))}
          className="w-7 bg-transparent text-center text-white font-mono text-[11px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label="Max citations"
        />
        <button
          type="button"
          onClick={() => !disabled && onMaxCitationsChange(clamp(maxCitations + 1))}
          disabled={disabled || maxCitations >= 50}
          aria-label="Increase max citations"
          className="w-4 h-4 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={9} weight="bold" />
        </button>
      </div>

      {createPortal(popover, document.body)}
    </div>
  );
}
