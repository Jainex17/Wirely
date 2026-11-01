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
  rect: DOMRect;
}

/**
 * Reads the tip for a hovered control: `data-tip` or the `aria-label`, and its
 * shortcut. The tip is the title alone, so `data-tip-detail` is not shown. A
 * text button whose label is its own text gets no tip, since it would only
 * repeat what is on screen.
 */
const readTip = (target: Element): Tip | null => {
  const raw = target.getAttribute("data-tip") ?? target.getAttribute("aria-label");
  if (!raw) return null;
  const match = SHORTCUT_PATTERN.exec(raw);
  const label = match ? match[1] : raw;
  const shortcut = match ? match[2] : null;
  if (!shortcut && target.textContent?.trim() === label) return null;
  return { label, shortcut, rect: target.getBoundingClientRect() };
};

const TIP_ID = "wirely-hover-tip";

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
      // Only this component sets it, so removing it never drops a React prop.
      current?.removeAttribute("aria-describedby");
      current = null;
      setTip(null);
    };

    // Screen readers announce the tip as the control's description.
    const show = (target: Element) => {
      if (current !== target || !target.isConnected) return;
      const next = readTip(target);
      if (next) target.setAttribute("aria-describedby", TIP_ID);
      setTip(next);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = event.target instanceof Element ? event.target.closest(TIP_TARGETS) : null;
      if (target === current) return;
      hide();
      if (!target || target.closest("[data-state='open']") === target) return;
      current = target;
      if (Date.now() - closedAt < WARM_WINDOW_MS) show(target);
      else timer = window.setTimeout(() => show(target), OPEN_DELAY_MS);
    };

    // Tabbing to a control shows its tip at once. A mouse click also focuses
    // it, which :focus-visible leaves out.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target.closest(TIP_TARGETS) : null;
      if (!target || !(event.target as Element).matches(":focus-visible")) return;
      hide();
      current = target;
      show(target);
    };

    // Leaving the window fires no pointerover, so the tip would stay up.
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("blur", hide);
    window.addEventListener("wheel", hide, { passive: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
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
      id={TIP_ID}
      role="tooltip"
      className="pointer-events-none fixed z-[300] max-w-64 truncate rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg"
      style={{
        ...horizontal,
        ...(isAbove
          ? { bottom: window.innerHeight - tip.rect.top + GAP }
          : { top: tip.rect.bottom + GAP }),
      }}
    >
      {tip.label}
      {tip.shortcut ? <span className="ml-1 text-muted-foreground">({tip.shortcut})</span> : null}
    </div>
  );
}
