"use client";

import { useEffect, useState, type ReactNode } from "react";

const HEADER_HEIGHT_PX = 64;

/**
 * The landing nav stays transparent over the hero and gets its background
 * once the hero text has scrolled under it. An IntersectionObserver on a
 * marker after the hero copy decides, so nothing runs on scroll frames.
 */
export default function LandingHeader({
  markerId,
  children,
}: {
  markerId: string;
  children: ReactNode;
}) {
  const [isSolid, setIsSolid] = useState(false);

  useEffect(() => {
    const marker = document.getElementById(markerId);
    if (!marker) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsSolid(entry.boundingClientRect.top < HEADER_HEIGHT_PX),
      { rootMargin: `-${HEADER_HEIGHT_PX}px 0px 0px 0px` },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [markerId]);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${
        isSolid
          ? "border-white/[0.06] bg-background/80 backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      {children}
    </header>
  );
}
