import { motion } from "framer-motion";
import { Plus, Upload, FileText, ChatText, Sparkle, BookOpen, MagnifyingGlass, Pulse } from "@phosphor-icons/react";

interface Props {
  variant: "no-chats" | "no-docs" | "no-search-results" | "no-pinned";
  searchQuery?: string;
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: any;
}

export function OnboardingEmpty({ variant, searchQuery, onAction, actionLabel, actionIcon: ActionIcon = Plus }: Props) {
  const config: Record<typeof variant, {
    icon: any;
    title: string;
    description: string;
    cta?: { label: string; icon: any };
  }> = {
    "no-chats": {
      icon: ChatText,
      title: "Start your first conversation",
      description: "Ask a question about your documents and get a cited answer in seconds.",
      cta: { label: "New chat", icon: Plus },
    },
    "no-docs": {
      icon: FileText,
      title: "No documents yet",
      description: "Upload PDFs, Markdown, or text files. We'll index them for instant semantic search.",
      cta: { label: "Upload document", icon: Upload },
    },
    "no-search-results": {
      icon: MagnifyingGlass,
      title: `No matches for "${searchQuery}"`,
      description: "Try a different keyword or check your spelling.",
    },
    "no-pinned": {
      icon: BookOpen,
      title: "Pin your important chats",
      description: "Hover a chat and click the pin icon to keep it at the top of your list.",
    },
  };

  const cfg = config[variant];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col items-center justify-center text-center px-6 py-10"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.35, ease: "backOut" }}
        className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.08] flex items-center justify-center mb-4"
      >
        <Icon size={26} weight="duotone" className="text-white/70" />
        <motion.div
          className="absolute inset-0 rounded-2xl border border-[#3B82F6]/30"
          animate={{ scale: [1, 1.3, 1.3], opacity: [0.4, 0, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      </motion.div>
      <h3 className="text-sm font-semibold text-white/90 mb-1">{cfg.title}</h3>
      <p className="text-xs text-white/40 max-w-[260px] leading-relaxed mb-4">{cfg.description}</p>
      {cfg.cta && onAction && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors"
        >
          <cfg.cta.icon size={13} weight="bold" />
          {actionLabel || cfg.cta.label}
        </motion.button>
      )}
    </motion.div>
  );
}
