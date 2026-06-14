import { motion } from "framer-motion";
import { ArrowDown } from "@phosphor-icons/react";
import { useEffect, useState, useRef } from "react";

interface Props {
  scrollContainer: React.RefObject<HTMLElement>;
  bottomRef: React.RefObject<HTMLElement>;
}

export function ScrollToBottom({ scrollContainer, bottomRef }: Props) {
  const [atBottom, setAtBottom] = useState(true);
  const unreadRef = useRef(0);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAtBottom(entry.isIntersecting),
      { threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [bottomRef]);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 120) {
        unreadRef.current = 0;
        forceRender((n) => n + 1);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollContainer]);

  useEffect(() => {
    if (atBottom) {
      unreadRef.current = 0;
      forceRender((n) => n + 1);
    }
  }, [atBottom]);

  if (atBottom && unreadRef.current === 0) return null;

  const scroll = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

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
      Jump to latest
    </motion.button>
  );
}
