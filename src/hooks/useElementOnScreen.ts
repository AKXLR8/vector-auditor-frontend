import { useEffect, useRef, useState } from "react";

export function useElementOnScreen<T extends HTMLElement>(
  options: IntersectionObserverInit = { threshold: 0.1 }
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, options);
    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return [ref, visible];
}
