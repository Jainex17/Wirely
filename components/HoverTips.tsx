"use client";

import { useEffect, useState } from "react";

const OPEN_DELAY_MS = 400;
// Moving from one control to the next within this window opens the next tip
// at once, the way toolbar tooltips behave in Figma.
const WARM_WINDOW_MS = 300;
const GAP = 8;
// Half the widest tip, so a centered tip near a window edge would not fit.
const EDGE_ROOM = 136;

// A trailing "(V)" or "(Shift+1)" in a label is its shortcut. Anything longer
// or with spaces is part of the label.
const SHORTCUT_PATTERN = /^(.*\S)\s*\(([^\s()]{1,12})\)$/;

interface Tip {
  label: string;
  shortcut: string | null;
  detail: string | null;
  rect: DOMRect;
}

/**
 * Reads the tip for a hovered control: `data-tip` or the `aria-label`, plus an
 * optional `data-tip-detail` line. A text button whose label is its own text
 * gets no tip, since it would only repeat what is on screen.
 */
const readTip = (target: Element): Tip | null => {
  const raw = target.getAttribute("data-tip") ?? target.getAttribute("aria-label");
  if (!raw) return null;
  const detail = target.getAttribute("data-tip-detail");
  const match = SHORTCUT_PATTERN.exec(raw);
  const label = match ? match[1] : raw;
  const shortcut = match ? match[2] : null;
  if (!detail && !shortcut && target.textContent?.trim() === label) return null;
  return { label, shortcut, detail, rect: target.getBoundingClientRect() };
};

const TIP_TARGETS = "[data-tip], button[aria-label], a[aria-label], [role='tab'][aria-label]";

/**
 * One tooltip for every labelled control under the editor, so a new button
 * gets a tip by having an aria-label, with no wrapper. Mounted once. It shows
 * below the control, or above it near the bottom of the window, where the
 * canvas tool bar sits.
 */
export default function HoverTips() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: Element | null = null;
    let closedAt = 0;

    const hide = () => {
      window.clearTimeout(timer);
      if (current) closedAt = Date.now();
      current = null;
      setTip(null);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = event.target instanceof Element ? event.target.closest(TIP_TARGETS) : null;
      if (target === current) return;
      hide();
      if (!target || target.closest("[data-state='open']") === target) return;
      current = target;
      const show = () => {
        if (current !== target || !target.isConnected) return;
        setTip(readTip(target));
      };
      if (Date.now() - closedAt < WARM_WINDOW_MS) show();
      else timer = window.setTimeout(show, OPEN_DELAY_MS);
    };

    // Leaving the window fires no pointerover, so the tip would stay up.
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("blur", hide);
    window.addEventListener("wheel", hide, { passive: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("wheel", hide);
    };
  }, []);

  if (!tip) return null;
  const isAbove = tip.rect.bottom + 64 > window.innerHeight;
  const centerX = tip.rect.left + tip.rect.width / 2;
  // Centered under the control, or lined up with its edge near a window edge
  // so the tip stays next to it instead of being pushed away.
  const horizontal =
    centerX < EDGE_ROOM
      ? { left: Math.max(tip.rect.left, GAP) }
      : centerX > window.innerWidth - EDGE_ROOM
        ? { right: Math.max(window.innerWidth - tip.rect.right, GAP) }
        : { left: centerX, transform: "translateX(-50%)" };
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[300] max-w-64 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg"
      style={{
        ...horizontal,
        ...(isAbove
          ? { bottom: window.innerHeight - tip.rect.top + GAP }
          : { top: tip.rect.bottom + GAP }),
      }}
    >
      <span className="flex items-center gap-2">
        <span className="font-medium">{tip.label}</span>
        {tip.shortcut ? (
          <kbd className="ml-auto rounded border border-border bg-muted px-1 font-sans text-[10px] text-muted-foreground">
            {tip.shortcut}
          </kbd>
        ) : null}
      </span>
      {tip.detail ? <span className="mt-0.5 block leading-snug text-muted-foreground">{tip.detail}</span> : null}
    </div>
  );
}
