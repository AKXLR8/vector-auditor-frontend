import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = "" }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex flex-col items-center justify-center text-center px-4 py-10 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 text-white/50">
        {icon}
      </div>
      <p className="text-sm font-medium text-white/80 mb-1">{title}</p>
      {description && <p className="text-xs text-white/40 max-w-xs leading-relaxed mb-4">{description}</p>}
      {action}
    </motion.div>
  );
}
