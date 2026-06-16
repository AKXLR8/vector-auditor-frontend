import { type ReactNode } from "react";
import { MagnifyingGlass, Plus, DotsThreeVertical } from "@phosphor-icons/react";
import { OnboardingEmpty } from "../OnboardingEmpty";
import type { LocalSession } from "../../types";

interface Props {
  sessions: LocalSession[];
  filteredSessions: LocalSession[];
  pinnedSessions: LocalSession[];
  otherSessions: LocalSession[];
  activeSessionId: string | null;
  chatSearch: string;
  onChatSearch: (v: string) => void;
  onNewChat: () => void;
  renderSessionRow: (session: LocalSession) => ReactNode;
}

const SESSION_ICONS: Record<string, string> = {
  "NDA Analysis": "📄",
  "Annual Report Review": "📑",
  "Contract Risk Detection": "⚖",
  "Research Assistant": "📚",
  "HR Policy Review": "📋",
};

function iconForSession(title: string): string {
  for (const [key, icon] of Object.entries(SESSION_ICONS)) {
    if (title.includes(key) || title.toLowerCase().includes("nda")) return icon;
  }
  return "💬";
}

export default function ChatListPanel({
  sessions,
  filteredSessions,
  pinnedSessions,
  otherSessions,
  activeSessionId,
  chatSearch,
  onChatSearch,
  onNewChat,
  renderSessionRow,
}: Props) {
  return (
    <aside className="w-[340px] flex flex-col bg-[#090909] border-r border-[rgba(255,255,255,0.06)] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <h1 className="text-base font-semibold text-white">Chats</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            className="w-8 h-8 rounded-xl bg-[#151515] border border-[rgba(255,255,255,0.06)] flex items-center justify-center text-[#9CA3AF] hover:text-white hover:border-white/20 transition-all"
            title="New Chat"
          >
            <Plus size={16} weight="bold" />
          </button>
          <button
            type="button"
            className="w-8 h-8 rounded-xl bg-[#151515] border border-[rgba(255,255,255,0.06)] flex items-center justify-center text-[#9CA3AF] hover:text-white hover:border-white/20 transition-all"
            title="More"
          >
            <DotsThreeVertical size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <div className="flex items-center gap-2.5 px-3.5 h-10 rounded-2xl bg-[#151515] border border-[rgba(255,255,255,0.06)] transition-colors duration-200 focus-within:border-[#3B82F6]/20">
          <MagnifyingGlass size={16} className="shrink-0 text-[#6B7280]" />
          <input
            value={chatSearch}
            onChange={(e) => onChatSearch(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search chats"
            className="flex-1 min-w-0 bg-transparent text-sm text-white/80 placeholder:text-[#6B7280] outline-none"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin">
        {!chatSearch && sessions.length === 0 && (
          <OnboardingEmpty variant="no-chats" onAction={onNewChat} />
        )}

        {pinnedSessions.length > 0 && (
          <div className="mb-1">
            {pinnedSessions.map((session) => renderSessionRow(session))}
          </div>
        )}

        {otherSessions.length > 0 && (
          <div>
            {pinnedSessions.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#6B7280] font-medium">
                All Chats
              </div>
            )}
            {otherSessions.map((session) => renderSessionRow(session))}
          </div>
        )}
      </div>
    </aside>
  );
}
