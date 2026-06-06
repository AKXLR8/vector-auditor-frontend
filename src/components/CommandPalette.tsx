import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Plus, FileText, House, SignOut, ChatText, MagnifyingGlass,
  Trash, Copy, ArrowsClockwise, Stop, Upload, File, Folder,
  Sparkle,
} from "@phosphor-icons/react";
import type { LocalSession, Document } from "../types";
import { modKey } from "../lib/format";
import { useClickOutside } from "../hooks/useClickOutside";

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  icon: any;
  category: string;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
  danger?: boolean;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sessions: LocalSession[];
  docs: Document[];
  onNewChat: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onToggleDocsPanel: () => void;
  onDeleteDoc: (id: string) => void;
  onUploadClick: () => void;
  onSignOut: () => void;
  onCopyLast?: () => void;
  onRegenerateLast?: () => void;
  onStopStream?: () => void;
  isStreaming?: boolean;
}

export function CommandPalette(props: CommandPaletteProps) {
  const {
    open, onClose, sessions, docs,
    onNewChat, onSwitchSession, onDeleteSession, onToggleDocsPanel,
    onDeleteDoc, onUploadClick, onSignOut,
    onCopyLast, onRegenerateLast, onStopStream, isStreaming,
  } = props;

  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useClickOutside(panelRef, () => onClose(), open);

  const items = useMemo<CommandAction[]>(() => {
    const list: CommandAction[] = [
      { id: "new-chat", label: "New chat", icon: Plus, category: "Actions", shortcut: `${modKey()}N`, action: () => { onNewChat(); onClose(); }, keywords: ["create", "start", "message"] },
      { id: "upload", label: "Upload documents", icon: Upload, category: "Actions", action: () => { onUploadClick(); onClose(); }, keywords: ["file", "pdf", "add"] },
      { id: "toggle-docs", label: "Toggle documents panel", icon: FileText, category: "Actions", action: () => { onToggleDocsPanel(); onClose(); }, keywords: ["sidebar", "panel"] },
      { id: "analysis", label: "Open analysis", icon: Sparkle, category: "Actions", action: () => { navigate("/analysis"); onClose(); }, keywords: ["research", "gaps", "insights", "breakdown"] },
      { id: "home", label: "Go to landing page", icon: House, category: "Actions", action: () => { navigate("/"); onClose(); } },
      { id: "signout", label: "Sign out", icon: SignOut, category: "Account", action: () => { onSignOut(); onClose(); }, danger: true },
    ];

    if (isStreaming && onStopStream) {
      list.unshift({ id: "stop", label: "Stop generation", icon: Stop, category: "Actions", action: () => { onStopStream(); onClose(); }, keywords: ["cancel", "abort"] });
    }
    if (onCopyLast) {
      list.unshift({ id: "copy-last", label: "Copy last response", icon: Copy, category: "Actions", action: () => { onCopyLast(); onClose(); }, keywords: ["clipboard"] });
    }
    if (onRegenerateLast && !isStreaming) {
      list.unshift({ id: "regen-last", label: "Regenerate last response", icon: ArrowsClockwise, category: "Actions", action: () => { onRegenerateLast(); onClose(); }, keywords: ["retry", "again"] });
    }

    sessions.slice(0, 8).forEach((s) => {
      const userCount = s.messages.filter((m) => m.role === "user").length;
      list.push({
        id: "session-" + s.id,
        label: s.title || "New chat",
        hint: `${userCount} message${userCount === 1 ? "" : "s"}`,
        icon: ChatText,
        category: "Chats",
        action: () => { onSwitchSession(s.id); onClose(); },
        keywords: [s.title.toLowerCase()],
      });
    });

    docs.slice(0, 12).forEach((d) => {
      const did = d.document_id ?? d.id;
      list.push({
        id: "doc-" + did,
        label: d.filename,
        hint: d.status,
        icon: File,
        category: "Documents",
        action: () => { onToggleDocsPanel(); onClose(); },
        keywords: [d.filename.toLowerCase()],
      });
    });

    return list;
  }, [sessions, docs, navigate, onNewChat, onToggleDocsPanel, onSignOut, onSwitchSession, onUploadClick, onCopyLast, onRegenerateLast, onStopStream, isStreaming, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.keywords?.some((k) => k.includes(q))
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[activeIdx]?.action();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.key === "Backspace" || e.key === "Delete") && filtered[activeIdx]) {
        const item = filtered[activeIdx];
        if (item.id.startsWith("session-") && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onDeleteSession(item.id.replace("session-", ""));
        } else if (item.id.startsWith("doc-") && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onDeleteDoc(item.id.replace("doc-", ""));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, activeIdx, onClose, onDeleteSession, onDeleteDoc]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const grouped = useMemo(() => {
    const out: Record<string, CommandAction[]> = {};
    for (const it of filtered) {
      (out[it.category] ||= []).push(it);
    }
    return out;
  }, [filtered]);

  let runningIdx = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] sm:pt-[14vh] px-4"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-[#0d0d10] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-white/5">
              <MagnifyingGlass size={16} className="text-white/40 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command, search chats or documents..."
                className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                aria-label="Command palette search"
              />
              <kbd className="px-1.5 py-0.5 text-[10px] text-white/40 border border-white/10 rounded font-mono">ESC</kbd>
            </div>
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
              {filtered.length === 0 ? (
                <div className="py-14 text-center text-sm text-white/40">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat} className="mb-1">
                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/30 font-medium">
                      {cat}
                    </p>
                    {items.map((it) => {
                      runningIdx++;
                      const idx = runningIdx;
                      const Icon = it.icon;
                      return (
                        <button
                          key={it.id}
                          data-idx={idx}
                          onClick={() => it.action()}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                            activeIdx === idx ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <Icon size={16} weight={activeIdx === idx ? "fill" : "regular"} className={it.danger ? "text-red-400" : activeIdx === idx ? "text-[#3B82F6]" : "text-white/50"} />
                          <span className={`flex-1 text-sm truncate ${it.danger ? "text-red-300" : "text-white"}`}>
                            {it.label}
                          </span>
                          {it.hint && <span className="text-[11px] text-white/30">{it.hint}</span>}
                          {it.shortcut && (
                            <kbd className="px-1.5 py-0.5 text-[10px] text-white/40 border border-white/10 rounded font-mono shrink-0">
                              {it.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5 text-[10px] text-white/40">
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1 border border-white/10 rounded font-mono">↑</kbd>
                <kbd className="px-1 border border-white/10 rounded font-mono">↓</kbd>
                navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1 border border-white/10 rounded font-mono">↵</kbd>
                select
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1 border border-white/10 rounded font-mono">{modKey()}</kbd>
                <kbd className="px-1 border border-white/10 rounded font-mono">⌫</kbd>
                delete session/doc
              </span>
              <div className="flex-1" />
              <span className="inline-flex items-center gap-1 text-white/30">
                <Folder size={10} /> {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
