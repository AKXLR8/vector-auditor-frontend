import { AnimatePresence, motion } from "framer-motion";
import { Warning } from "@phosphor-icons/react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#0d0d10] border border-white/10 rounded-2xl p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              {danger && (
                <div className="w-9 h-9 shrink-0 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Warning size={18} weight="duotone" className="text-red-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold mb-1">{title}</h2>
                {description && (
                  <p className="text-xs text-white/60 leading-relaxed">{description}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2 rounded-lg text-sm border border-white/10 text-white/80 hover:bg-white/5 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  danger
                    ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                    : "bg-white text-black hover:bg-white/90"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
