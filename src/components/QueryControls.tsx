import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Lightning, CaretDown, Check, Robot } from "@phosphor-icons/react";
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

const MODEL_OPTIONS = [
  { id: "mercury-2", label: "Mercury-2" },
  { id: "minimx-m3", label: "Minimax-m3" },
];

interface Props {
  mode: QueryMode;
  onModeChange: (m: QueryMode) => void;
  model: string;
  onModelChange: (m: string) => void;
  disabled?: boolean;
}

function getRectAbove(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { left: r.left, bottom: window.innerHeight - r.top + 4, minWidth: Math.max(r.width, 180) };
}

export function QueryControls({ mode, onModeChange, model, onModelChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, bottom: 0, minWidth: 180 });
  const [modelPos, setModelPos] = useState({ left: 0, bottom: 0, minWidth: 180 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const modelPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (modelPopoverRef.current?.contains(e.target as Node)) return;
      if (modelTriggerRef.current?.contains(e.target as Node)) return;
      setModelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [modelOpen]);

  const current = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0];
  const CurrentIcon = current.icon;
  const currentModel = MODEL_OPTIONS.find((o) => o.id === model) ?? MODEL_OPTIONS[0];

  const dropdownTransition = {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
    mass: 0.4,
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (disabled) return;
            if (!open && triggerRef.current) setPos(getRectAbove(triggerRef.current));
            setOpen((o) => !o);
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={mode === "white_box" ? "Researcher — detailed reasoning, gap analysis, verification" : "Direct — concise answer, no reasoning"}
          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-all border ${
            open
              ? "bg-white/[0.08] border-white/[0.12] text-white"
              : "bg-white/[0.03] border-white/[0.06] text-white/80 hover:bg-white/[0.06] hover:border-white/[0.1]"
          } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <CurrentIcon size={11} weight="bold" className={mode === "white_box" ? "text-[#60A5FA]" : "text-amber-300"} />
          <span>{current.label}</span>
          <CaretDown size={9} weight="bold" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="relative">
        <button
          ref={modelTriggerRef}
          type="button"
          onClick={() => {
            if (disabled) return;
            if (!modelOpen && modelTriggerRef.current) setModelPos(getRectAbove(modelTriggerRef.current));
            setModelOpen((o) => !o);
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={modelOpen}
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-all border ${
            modelOpen
              ? "bg-white/[0.08] border-white/[0.12] text-white"
              : "bg-white/[0.03] border-white/[0.06] text-white/80 hover:bg-white/[0.06] hover:border-white/[0.1]"
          } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <Robot size={11} weight="bold" className="text-[#60A5FA]" />
          <span>{currentModel.label}</span>
          <CaretDown size={9} weight="bold" className={`transition-transform duration-200 ${modelOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              role="listbox"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={dropdownTransition}
              style={{ position: "fixed", left: pos.left, bottom: pos.bottom, minWidth: pos.minWidth, zIndex: 9999 }}
              className="bg-[#0d0d10] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden origin-bottom-left"
            >
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = opt.value === mode;
                return (
                  <button
                    key={opt.value}
                    role="option"
                    aria-selected={selected}
                    onClick={() => { onModeChange(opt.value); setOpen(false); }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${selected ? "bg-[#3B82F6]/10" : "hover:bg-white/[0.05]"}`}
                  >
                    <Icon size={14} weight="bold" className={`mt-0.5 shrink-0 ${opt.value === "white_box" ? "text-[#60A5FA]" : "text-amber-300"}`} />
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
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {modelOpen && (
            <motion.div
              ref={modelPopoverRef}
              role="listbox"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={dropdownTransition}
              style={{ position: "fixed", left: modelPos.left, bottom: modelPos.bottom, minWidth: modelPos.minWidth, zIndex: 9999 }}
              className="bg-[#0d0d10] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden origin-bottom-left"
            >
              {MODEL_OPTIONS.map((opt) => {
                const selected = opt.id === model;
                return (
                  <button
                    key={opt.id}
                    role="option"
                    aria-selected={selected}
                    onClick={() => { onModelChange(opt.id); setModelOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${selected ? "bg-[#3B82F6]/10" : "hover:bg-white/[0.05]"}`}
                  >
                    <Robot size={14} weight="bold" className="shrink-0 text-[#60A5FA]" />
                    <span className="text-xs font-semibold text-white flex-1">{opt.label}</span>
                    {selected && <Check size={12} weight="bold" className="text-[#3B82F6] shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
