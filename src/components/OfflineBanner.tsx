import { AnimatePresence, motion } from "framer-motion";
import { WifiSlash, WifiHigh } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineBanner() {
  const online = useOnlineStatus();
  const [justCameOnline, setJustCameOnline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
    } else if (wasOffline) {
      setJustCameOnline(true);
      const t = window.setTimeout(() => {
        setJustCameOnline(false);
        setWasOffline(false);
      }, 2500);
      return () => window.clearTimeout(t);
    }
  }, [online, wasOffline]);

  const visible = !online || justCameOnline;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={online ? "online" : "offline"}
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          role="status"
          aria-live="polite"
          className={`fixed top-0 inset-x-0 z-50 backdrop-blur-xl border-b ${
            online
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-amber-500/15 border-amber-500/30"
          }`}
        >
          <div className={`max-w-3xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-xs ${
            online ? "text-emerald-200" : "text-amber-200"
          }`}>
            {online ? <WifiHigh size={14} weight="bold" /> : <WifiSlash size={14} weight="bold" />}
            <span className="font-medium">
              {online ? "Back online — syncing changes" : "You're offline. Changes will sync when you reconnect."}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
