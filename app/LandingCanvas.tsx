"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Frame, Hand, MessageCircle, MousePointer2, PenTool } from "lucide-react";
import WirelyMark from "@/components/icons/WirelyMark";
import {
  LANDING_DIRECTIONS,
  LANDING_FRAME,
  LANDING_RUN_DONE,
  LANDING_WRITE_STARTS,
} from "./landingExamples";

const HERO_PROMPT = "Design three different layouts for a habit tracker.";

/**
 * One page at phone size, scaled down the way the canvas shows it. The frame
 * is sandboxed with no scripts: the examples are static HTML, and the landing
 * page must never give a srcdoc its origin.
 */
export function ScreenFrame({
  html,
  title,
  scale,
  className = "",
  lazy = false,
}: {
  html: string;
  title: string;
  scale: number;
  className?: string;
  /** Below-the-fold frames load near the viewport, so their write plays there. */
  lazy?: boolean;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[22px] bg-white shadow-lg ring-1 ring-black/10 ${className}`}
      style={{ width: LANDING_FRAME.width * scale, height: LANDING_FRAME.height * scale }}
    >
      <iframe
        title={title}
        srcDoc={html}
        sandbox=""
        loading={lazy ? "lazy" : "eager"}
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{
          width: LANDING_FRAME.width,
          height: LANDING_FRAME.height,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

/** Three window dots, the chrome every product window on the page shares. */
function WindowDots() {
  return (
    <span className="flex gap-1.5">
      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
      <span className="size-2.5 rounded-full bg-[#febc2e]" />
      <span className="size-2.5 rounded-full bg-[#28c840]" />
    </span>
  );
}

const CANVAS_TOOLS = [
  { icon: MousePointer2, label: "Select", active: true },
  { icon: Hand, label: "Hand", active: false },
  { icon: Frame, label: "Frame", active: false },
  { icon: MessageCircle, label: "Comment", active: false },
  { icon: PenTool, label: "Pen", active: false },
] as const;

/** A teammate's cursor crossing the canvas to look at the second page. */
function CollaboratorCursor() {
  return (
    <div
      className="collab"
      style={{ "--start": `${LANDING_RUN_DONE + 0.6}s` } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="size-4 drop-shadow" fill="#f59e0b">
        <path d="M1 1l5.5 13 1.8-5.4L14 6.8z" />
      </svg>
      <span className="ml-3 inline-block rounded-md bg-[#f59e0b] px-1.5 py-0.5 text-[11px] font-bold text-[#1c1206]">
        Priya
      </span>
    </div>
  );
}

/**
 * The editor canvas, dark like the real one. Three pages write themselves,
 * each caption flips from writing to done as its cursor leaves, the run chip
 * in the title bar settles once the last page lands, and a teammate's cursor
 * comes over to look. All of it is CSS keyed to the write schedule.
 */
export function CanvasWindow() {
  const stage = useRef<HTMLDivElement>(null);
  // The run starts when the window scrolls into view, not at page load, so
  // the reader sees the pages being written. The frames get their HTML at the
  // same moment, which keeps the writes inside them in step with the chrome.
  const [isLive, setIsLive] = useState(false);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsLive(true);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const runDone = { "--done": `${LANDING_RUN_DONE}s` } as React.CSSProperties;
  return (
    <div
      ref={stage}
      data-live={isLive ? "" : undefined}
      className="stage window-dark overflow-hidden rounded-[14px]"
    >
      <div className="flex h-11 items-center gap-4 border-b border-white/[0.07] px-4">
        <WindowDots />
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-white/90">
          <WirelyMark className="size-4 text-white" />
          Habit tracker
        </span>
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-white/60">
          <span aria-hidden>&gt;</span>
          <span
            className="type-in"
            style={{ "--chars": HERO_PROMPT.length } as React.CSSProperties}
          >
            {HERO_PROMPT}
          </span>
        </span>
        <span className="swap ml-auto shrink-0 whitespace-nowrap text-xs" style={runDone}>
          <span className="swap-out flex items-center gap-2 text-sky-300">
            <span className="pulse-dot size-1.5 rounded-full bg-sky-300" />
            Writing 3 pages
          </span>
          <span className="swap-in flex items-center gap-1.5 text-emerald-400">
            <Check className="size-3.5" strokeWidth={3} />3 pages ready
          </span>
        </span>
      </div>
      <div className="relative overflow-x-auto overflow-y-hidden">
        <div className="canvas-dots pointer-events-none absolute inset-0" />
        <CollaboratorCursor />
        <div className="relative flex min-w-max justify-center gap-10 px-8 pb-16 pt-7">
          {LANDING_DIRECTIONS.map((direction, index) => {
            const timing = {
              "--start": `${LANDING_WRITE_STARTS[index] - 0.5}s`,
              "--done": `${direction.done}s`,
            } as React.CSSProperties;
            return (
              <figure key={direction.title} className="group" style={timing}>
                <figcaption className="mb-2.5 flex items-center gap-2 text-xs text-white/55 transition-colors group-hover:text-white">
                  {direction.title}
                  <span className="swap font-mono text-[10px]">
                    <span className="swap-out flex items-center gap-1.5 text-sky-300">
                      <span className="pulse-dot size-1.5 rounded-full bg-sky-300" />
                      writing
                    </span>
                    <span className="swap-in flex items-center gap-1 text-emerald-400">
                      <Check className="size-3" strokeWidth={3} />
                      done
                    </span>
                  </span>
                  <span className="ml-auto text-white/30 opacity-0 transition-opacity group-hover:opacity-100">
                    390×844
                  </span>
                </figcaption>
                {/* The same sky outline the editor draws on a hovered frame. */}
                <ScreenFrame
                  html={isLive ? direction.html : ""}
                  title={direction.title}
                  scale={0.56}
                  className="frame-drop ring-white/10 transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-sky-400/70"
                />
              </figure>
            );
          })}
        </div>
        {/* The editor's bottom toolbar and zoom readout, so the window reads as the product. */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
          <span className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#1d2027] p-1 shadow-lg">
            {CANVAS_TOOLS.map((tool) => (
              <span
                key={tool.label}
                title={tool.label}
                className={`grid size-7 place-items-center rounded-md ${
                  tool.active ? "bg-white/10 text-white" : "text-white/55"
                }`}
              >
                <tool.icon className="size-3.5" strokeWidth={2} />
              </span>
            ))}
          </span>
          <span className="rounded-lg border border-white/10 bg-[#1d2027] px-2 py-1.5 font-mono text-[11px] text-white/60 shadow-lg">
            56%
          </span>
        </div>
      </div>
    </div>
  );
}

