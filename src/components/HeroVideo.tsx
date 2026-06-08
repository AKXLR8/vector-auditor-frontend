import { useEffect, useState } from "react";

export function HeroVideo() {
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    if (typeof w.requestIdleCallback !== "function") {
      const t = w.setTimeout(() => setShouldMount(true), 250);
      return () => w.clearTimeout(t);
    }
    const id = w.requestIdleCallback(() => setShouldMount(true), { timeout: 600 });
    return () => {
      w.cancelIdleCallback?.(id);
    };
  }, []);

  useEffect(() => {
    return () => {
      const v = document.querySelector("video[data-hero-bg]") as HTMLVideoElement | null;
      v?.pause();
    };
  }, []);

  if (!shouldMount) {
    return (
      <div
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(30,58,95,0.55) 0%, rgba(7,14,13,0.0) 60%), linear-gradient(180deg, #070E0D 0%, #050A0A 100%)",
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      <video
        data-hero-bg
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="w-full h-full object-cover pointer-events-none scale-110 will-change-[transform]"
        style={{ filter: "blur(4px) brightness(0.35)" }}
      >
        <source src="/video/upscaled-video.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-[#070E0D]/40 via-transparent to-[#070E0D]/60" />
    </div>
  );
}
