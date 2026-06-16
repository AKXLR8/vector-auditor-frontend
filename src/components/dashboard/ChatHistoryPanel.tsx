import { type ReactNode } from "react";
import { MagnifyingGlass, XCircle, Command, Plus, PushPin, ChatText, SignOut } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { OnboardingEmpty } from "../OnboardingEmpty";
import type { LocalSession } from "../../types";

interface Props {
  sessions: LocalSession[];
  filteredSessions: LocalSession[];
  pinnedSessions: LocalSession[];
  otherSessions: LocalSession[];
  activeSessionId: string | null;
  pinnedIds: string[];
  chatSearch: string;
  onChatSearch: (v: string) => void;
  onNewChat: () => void;
  onCommandPalette: () => void;
  onLogout: () => void;
  renderSessionRow: (session: LocalSession) => ReactNode;
}

export default function ChatHistoryPanel({
  sessions,
  filteredSessions,
  pinnedSessions,
  otherSessions,
  activeSessionId,
  pinnedIds,
  chatSearch,
  onChatSearch,
  onNewChat,
  onCommandPalette,
  onLogout,
  renderSessionRow,
}: Props) {
  return (
    <aside className="w-[320px] flex flex-col bg-[#050505] border-r border-[rgba(255,255,255,0.06)] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#171717] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
            <img src="/logo.png" alt="VecXAud" className="w-5 h-5 object-contain" />
          </div>
          <span className="text-sm font-semibold text-white/80">Vector Auditor</span>
        </div>
        <span className="text-[10px] text-[#9CA3AF]/40 font-mono">{sessions.length}</span>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-lg bg-[#101010] border border-[rgba(255,255,255,0.06)] text-sm transition-[colors] duration-200 focus-within:border-[#E8F28A]/20">
            <MagnifyingGlass size={14} className="shrink-0 text-white/30" />
            <input
              value={chatSearch}
              onChange={(e) => onChatSearch(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search chats"
              className="flex-1 min-w-0 bg-transparent text-white/80 placeholder:text-white/25 text-sm outline-none"
            />
            {chatSearch && (
              <button
                type="button"
                onClick={() => onChatSearch("")}
                aria-label="Clear search"
                className="text-white/30 hover:text-white/60 transition-colors shrink-0"
              >
                <XCircle size={13} weight="fill" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onCommandPalette}
            aria-label="Command palette"
            title="Command palette (⌘K)"
            className="w-9 h-9 rounded-lg bg-[#101010] border border-[rgba(255,255,255,0.06)] flex items-center justify-center text-white/30 hover:text-white/60 transition-colors shrink-0"
          >
            <Command size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* New Chat button */}
      <div className="px-3 pb-3 shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-lg font-medium text-sm text-[#050505] bg-[#E8F28A] hover:bg-[#E8F28A]/90 active:scale-[0.97] transition-all duration-200 shadow-[0_0_12px_rgba(232,242,138,0.15)]"
        >
          <Plus size={15} weight="bold" />
          New Chat
        </button>
      </div>

      {/* Divider */}
      <div className="px-4 pb-2 shrink-0">
        <div className="border-t border-[rgba(255,255,255,0.06)]" />
      </div>

      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1 scrollbar-thin">
        {/* Empty state */}
        {!chatSearch && sessions.length === 0 && (
          <OnboardingEmpty variant="no-chats" onAction={onNewChat} />
        )}
        {chatSearch && filteredSessions.length === 0 && sessions.length > 0 && (
          <OnboardingEmpty variant="no-search-results" searchQuery={chatSearch} />
        )}

        {/* Pinned section */}
        {pinnedSessions.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <PushPin size={10} weight="fill" className="text-[#9CA3AF]/50" />
              <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]/40 font-medium">Pinned</span>
              <span className="text-[9px] text-[#9CA3AF]/30 font-mono">{pinnedSessions.length}</span>
            </div>
            <div className="space-y-0.5">
              {pinnedSessions.map((session) => renderSessionRow(session))}
            </div>
          </div>
        )}

        {/* All chats section */}
        {otherSessions.length > 0 && (
          <div className="space-y-0.5">
            {pinnedSessions.length > 0 && (
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <ChatText size={10} className="text-[#9CA3AF]/50" />
                <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]/40 font-medium">All chats</span>
                <span className="text-[9px] text-[#9CA3AF]/30 font-mono">{otherSessions.length}</span>
              </div>
            )}
            {otherSessions.map((session) => renderSessionRow(session))}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 border-t border-[rgba(255,255,255,0.06)] px-2 py-2">
        <Link
          to="/analysis"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#9CA3AF]/60 hover:text-white hover:bg-[#101010] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Analysis
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#9CA3AF]/60 hover:text-red-400 hover:bg-red-500/5 transition-colors"
        >
          <SignOut size={13} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
