import { useRef, useCallback, useEffect } from "react";

interface SwipeOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  threshold?: number;
  enabled?: boolean;
  edgeOnly?: number;
}

export function useSwipeGesture({
  onSwipeRight,
  onSwipeLeft,
  threshold = 50,
  enabled = true,
  edgeOnly,
}: SwipeOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchEnd = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      const x = e.targetTouches[0].clientX;
      if (edgeOnly !== undefined && x > edgeOnly) return;
      touchEnd.current = null;
      touchStart.current = { x, y: e.targetTouches[0].clientY };
    },
    [enabled, edgeOnly]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      touchEnd.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
      };
    },
    [enabled]
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled || !touchStart.current || !touchEnd.current) return;
    const dx = touchEnd.current.x - touchStart.current.x;
    const dy = Math.abs(touchEnd.current.y - touchStart.current.y);
    if (dy > 100) return; // vertical scroll — ignore
    if (dx > threshold) onSwipeRight?.();
    else if (dx < -threshold) onSwipeLeft?.();
    touchStart.current = null;
    touchEnd.current = null;
  }, [enabled, threshold, onSwipeRight, onSwipeLeft]);

  useEffect(() => {
    if (!enabled) return;
    const el = document.documentElement;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, onTouchStart, onTouchMove, onTouchEnd]);
}
