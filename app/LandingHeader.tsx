"use client";

import { useEffect, useState, type ReactNode } from "react";

const HEADER_HEIGHT_PX = 64;

/**
 * The landing nav sits flat over the hero and turns into a floating pill once
 * the hero copy has scrolled under it. An IntersectionObserver on a marker
 * after the hero decides, so nothing runs on scroll frames.
 */
export default function LandingHeader({
  markerId,
  children,
}: {
  markerId: string;
  children: ReactNode;
}) {
  const [isFloating, setIsFloating] = useState(false);

  useEffect(() => {
    const marker = document.getElementById(markerId);
    if (!marker) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsFloating(entry.boundingClientRect.top < HEADER_HEIGHT_PX),
      { rootMargin: `-${HEADER_HEIGHT_PX}px 0px 0px 0px` },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [markerId]);

  return (
    <header className="sticky top-0 z-40 px-3 pt-2">
      <div
        className={`mx-auto rounded-2xl border transition-[max-width,background-color,border-color,box-shadow,backdrop-filter] duration-300 ${
          isFloating
            ? "max-w-5xl border-black/10 bg-white/90 shadow-[0_1px_2px_rgba(11,16,32,0.06),0_12px_32px_-16px_rgba(11,16,32,0.35)] backdrop-blur-md"
            : "max-w-6xl border-transparent bg-transparent"
        }`}
      >
        {children}
      </div>
    </header>
  );
}
