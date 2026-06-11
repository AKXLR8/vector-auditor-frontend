import { AnimatePresence, motion } from "framer-motion";
import { CloudArrowUp } from "@phosphor-icons/react";
import { useState, type DragEvent, type ReactNode } from "react";

interface Props {
  onFiles: (files: FileList | null) => void;
  accept?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function FileDropZone({ onFiles, accept = ".pdf,.md,.txt,.docx", children, className = "", disabled }: Props) {
  const [over, setOver] = useState(false);

  const onDragOver = (e: DragEvent) => {
    if (disabled) return;
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!over) setOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget === e.target) setOver(false);
  };

  const onDrop = (e: DragEvent) => {
    if (disabled) return;
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    setOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) onFiles(files);
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative ${className}`}
    >
      {children}
      <AnimatePresence>
        {over && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute inset-0 z-30 rounded-2xl border-2 border-dashed border-[#3B82F6] bg-[#3B82F6]/[0.08] backdrop-blur-sm flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-2 text-[#3B82F6]">
              <CloudArrowUp size={32} weight="duotone" />
              <p className="text-sm font-semibold">Drop to upload</p>
              <p className="text-xs text-white/50">PDF, MD, TXT, DOCX</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
