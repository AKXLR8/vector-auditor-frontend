import { AnimatePresence, motion } from "framer-motion";
import { ShieldWarning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function SessionExpiryModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const handler = () => setOpen(true);
    window.addEventListener("va:session-expiring", handler);
    return () => window.removeEventListener("va:session-expiring", handler);
  }, [user]);

  const refresh = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("va:trigger-expiry-warning"));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={refresh}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#0d0d10] border border-white/10 rounded-2xl p-5 shadow-2xl"
            role="alertdialog"
            aria-labelledby="session-expiry-title"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
              <ShieldWarning size={20} weight="duotone" className="text-amber-400" />
            </div>
            <h2 id="session-expiry-title" className="text-base font-semibold mb-1">Your session is expiring soon</h2>
            <p className="text-sm text-white/60 mb-5 leading-relaxed">
              For your security, we&rsquo;ll sign you out shortly. Stay signed in to keep working without interruption.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setOpen(false); navigate("/login"); }}
                className="flex-1 py-2 rounded-lg text-sm border border-white/10 text-white/80 hover:bg-white/5 transition-colors"
              >
                Sign out now
              </button>
              <button
                onClick={refresh}
                className="flex-1 py-2 rounded-lg text-sm bg-white text-black font-semibold hover:bg-white/90 transition-colors"
              >
                Keep working
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
