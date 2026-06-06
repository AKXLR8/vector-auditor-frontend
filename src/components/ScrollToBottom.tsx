import { motion } from "framer-motion";
import { ArrowDown } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useElementOnScreen } from "../hooks/useElementOnScreen";

interface Props {
  scrollContainer: React.RefObject<HTMLElement>;
  bottomRef: React.RefObject<HTMLElement>;
}

export function ScrollToBottom({ scrollContainer, bottomRef }: Props) {
  const [, sentinelVisible] = useElementOnScreen<HTMLDivElement>({ threshold: 0.01 });
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = distance < 120;
      if (near) setUnread(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollContainer]);

  useEffect(() => {
    if (sentinelVisible) setUnread(0);
  }, [sentinelVisible]);

  const scroll = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  if (sentinelVisible && unread === 0) return null;

  return (
    <motion.button
      type="button"
      onClick={scroll}
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.9 }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Scroll to latest message"
      className="pointer-events-auto absolute bottom-[120px] left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.08] backdrop-blur-md ring-1 ring-white/10 text-white text-xs font-semibold shadow-lg shadow-black/40 hover:bg-white/[0.14] hover:ring-white/20 transition-colors"
    >
      <ArrowDown size={13} weight="bold" />
      {unread > 0 ? `${unread} new` : "Jump to latest"}
    </motion.button>
  );
}
