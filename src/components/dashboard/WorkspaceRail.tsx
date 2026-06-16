import { motion } from "framer-motion";
import type { DocGroup } from "../../types";

interface Props {
  docGroups: DocGroup[];
  activeGroupId: string | null;
  onSelectWorkspace: (groupId: string | null) => void;
  onAddWorkspace: () => void;
  onOpenSettings: () => void;
}

const DEFAULT_WORKSPACES = [
  { id: "research", label: "R", name: "Research" },
  { id: "legal", label: "L", name: "Legal" },
  { id: "finance", label: "F", name: "Finance" },
  { id: "hr", label: "H", name: "HR" },
];

function WorkspaceCircle({
  label,
  name,
  active,
  onClick,
}: {
  label: string;
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      className="group relative"
      title={name}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
          active
            ? "bg-[#E8F28A] text-[#050505] shadow-[0_0_12px_rgba(232,242,138,0.3)]"
            : "bg-[#171717] text-[#9CA3AF] border border-[rgba(255,255,255,0.06)] hover:border-[#E8F28A]/30 hover:text-white"
        }`}
      >
        {label}
      </div>
      <motion.div
        initial={false}
        animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: -4 }}
        className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-[#E8F28A]"
      />
    </motion.button>
  );
}

export default function WorkspaceRail({
  docGroups,
  activeGroupId,
  onSelectWorkspace,
  onAddWorkspace,
  onOpenSettings,
}: Props) {
  return (
    <nav className="w-[72px] flex flex-col items-center gap-3 py-4 bg-[#0A0A0A] border-r border-[rgba(255,255,255,0.06)] shrink-0">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-10 h-10 rounded-full bg-[#171717] border border-[rgba(255,255,255,0.06)] flex items-center justify-center shadow-[0_0_16px_rgba(232,242,138,0.15)] mb-1"
      >
        <img src="/logo.png" alt="VecXAud" className="w-6 h-6 object-contain" />
      </motion.div>

      {/* All Documents */}
      <WorkspaceCircle
        label="A"
        name="All Documents"
        active={activeGroupId === null}
        onClick={() => onSelectWorkspace(null)}
      />

      {/* Divider */}
      <div className="w-6 h-px bg-[rgba(255,255,255,0.06)]" />

      {/* Document groups as workspaces */}
      {docGroups.length > 0
        ? docGroups.map((g) => (
            <WorkspaceCircle
              key={g.id}
              label={g.name.slice(0, 2).toUpperCase()}
              name={g.name}
              active={activeGroupId === g.id}
              onClick={() => onSelectWorkspace(g.id)}
            />
          ))
        : DEFAULT_WORKSPACES.map((w) => (
            <WorkspaceCircle
              key={w.id}
              label={w.label}
              name={w.name}
              active={false}
              onClick={() => {}}
            />
          ))}
      <div className="flex-1" />

      {/* Settings */}
      <motion.button
        onClick={onOpenSettings}
        whileHover={{ scale: 1.08, rotate: 30 }}
        whileTap={{ scale: 0.92 }}
        className="w-10 h-10 rounded-full bg-[#171717] border border-[rgba(255,255,255,0.06)] flex items-center justify-center text-[#9CA3AF] hover:text-white hover:border-white/20 transition-all duration-200"
        title="Settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </motion.button>

      {/* Add workspace */}
      <motion.button
        onClick={onAddWorkspace}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className="w-10 h-10 rounded-full bg-[#E8F28A] flex items-center justify-center text-[#050505] shadow-[0_0_12px_rgba(232,242,138,0.25)] hover:shadow-[0_0_20px_rgba(232,242,138,0.4)] transition-all duration-200"
        title="New workspace"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </motion.button>
    </nav>
  );
}
