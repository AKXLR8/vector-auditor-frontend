import { type ReactNode } from "react";
import { motion } from "framer-motion";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "documents",
    label: "Documents",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: "chats",
    label: "Chats",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

interface Props {
  activeNav: string;
  onNavChange: (id: string) => void;
  onAddCollection: () => void;
  username: string;
}

export default function LeftNavRail({ activeNav, onNavChange, onAddCollection, username }: Props) {
  return (
    <nav className="w-[72px] flex flex-col items-center py-4 bg-[#090909] border-r border-[rgba(255,255,255,0.06)] shrink-0 relative">
      {/* Logo — glowing beacon */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-xl bg-[#3B82F6]/10 blur-md" />
        <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-[#151515] to-[#1A1A1A] border border-[rgba(59,130,246,0.1)] flex items-center justify-center shadow-[0_0_16px_rgba(59,130,246,0.08)]">
          <img src="/logo.png" alt="V" className="w-5.5 h-5.5 object-contain" />
        </div>
      </div>

      {/* Nav items */}
      <div className="flex flex-col items-center gap-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeNav === item.id;
          return (
            <div key={item.id} className="relative group">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavChange(item.id)}
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? "text-[#3B82F6] bg-gradient-to-br from-[rgba(59,130,246,0.12)] to-[rgba(59,130,246,0.04)] shadow-[0_0_20px_rgba(59,130,246,0.06)]"
                    : "text-[#4B5563] hover:text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.03)]"
                }`}
              >
                {item.icon}
                {/* Active glow ring */}
                {isActive && (
                  <motion.div
                    layoutId="navRing"
                    className="absolute inset-0 rounded-2xl border border-[rgba(59,130,246,0.15)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
              {/* Active indicator dot */}
              <motion.div
                layoutId="navDot"
                className={`absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full ${
                  isActive ? "bg-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-transparent"
                }`}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
              {/* Tooltip */}
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#151515] border border-[rgba(255,255,255,0.06)] text-xs text-white font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
                {item.label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 w-2 h-2 bg-[#151515] border-l border-t border-[rgba(255,255,255,0.06)] -rotate-45" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="flex flex-col items-center gap-2 mt-auto">
        {/* Profile */}
        <div className="relative group">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[rgba(59,130,246,0.15)] to-[rgba(59,130,246,0.03)] border border-[rgba(59,130,246,0.1)] flex items-center justify-center text-xs font-semibold text-[#3B82F6] shadow-[0_0_12px_rgba(59,130,246,0.05)] cursor-pointer"
          >
            {username.slice(0, 2).toUpperCase()}
          </motion.div>
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#151515] border border-[rgba(255,255,255,0.06)] text-xs text-white whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
            {username}
            <div className="absolute right-full top-1/2 -translate-y-1/2 w-2 h-2 bg-[#151515] border-l border-t border-[rgba(255,255,255,0.06)] -rotate-45" />
          </div>
        </div>

        {/* Add Collection */}
        <motion.button
          whileHover={{ scale: 1.05, rotate: 90 }}
          whileTap={{ scale: 0.95 }}
          onClick={onAddCollection}
          className="relative group w-11 h-11 rounded-2xl bg-[#151515] border border-dashed border-[rgba(255,255,255,0.08)] flex items-center justify-center text-[#4B5563] hover:text-[#3B82F6] hover:border-[#3B82F6]/20 transition-all duration-300"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#151515] border border-[rgba(255,255,255,0.06)] text-xs text-white whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
            New collection
            <div className="absolute right-full top-1/2 -translate-y-1/2 w-2 h-2 bg-[#151515] border-l border-t border-[rgba(255,255,255,0.06)] -rotate-45" />
          </div>
        </motion.button>
      </div>
    </nav>
  );
}
