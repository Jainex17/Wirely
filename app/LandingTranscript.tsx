"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Line =
  | { kind: "prompt"; text: string; link?: string }
  | { kind: "call"; tool: string; args: string; result?: string }
  | { kind: "edit"; file: string }
  | { kind: "note"; text: string };

/**
 * A Claude Code session running the whole loop: pages onto the canvas, one
 * element edited from a picked link, then the chosen page built in the repo.
 * The tool names are the real ones from the MCP server.
 */
const LINES: Line[] = [
  { kind: "prompt", text: "Design three different layouts for the habit tracker home screen." },
  { kind: "call", tool: "create_project", args: "Habit tracker", result: "/wire/7f3c" },
  { kind: "call", tool: "add_page", args: "Calendar grid, 390×844" },
  { kind: "call", tool: "add_page", args: "Streak cards, 390×844" },
  { kind: "call", tool: "add_page", args: "Daily timeline, 390×844", result: "Three pages are on your canvas." },
  {
    kind: "prompt",
    text: "I like Streak cards. Make the day count bigger than the ring.",
    link: "/wire/7f3c?page=a91e&node=n4k2",
  },
  { kind: "call", tool: "get_page", args: "node n4k2", result: '<p class="days">…</p>' },
  { kind: "call", tool: "patch_page", args: "Streak cards", result: "Updated. One element changed." },
  { kind: "prompt", text: "Good. Build that one." },
  { kind: "edit", file: "app/(tabs)/today.tsx" },
  { kind: "edit", file: "components/StreakCard.tsx" },
  { kind: "note", text: "⎿ Streak cards is in. It matches the page on your canvas." },
];

// Seconds each kind of line takes before the next one lands. A prompt is
// typed at about 28 characters a second; everything else arrives at once.
const lineDuration = (line: Line) =>
  line.kind === "prompt" ? 0.5 + line.text.length / 28 : line.kind === "call" ? 0.55 : 0.4;
const HOLD_SECONDS = 4;

function TypedPrompt({ line }: { line: Extract<Line, { kind: "prompt" }> }) {
  return (
    <p className="rounded-lg border border-white/[0.12] px-3 py-2 text-white">
      <span className="text-white/40">&gt;</span>{" "}
      <span
        className="type-in align-bottom"
        style={
          {
            "--chars": line.text.length,
            animationDuration: `${line.text.length / 28}s, 0s`,
            animationDelay: "0s, 0s",
          } as React.CSSProperties
        }
      >
        {line.text}
      </span>
      {line.link ? <span className="text-sky-300"> {line.link}</span> : null}
    </p>
  );
}

function TranscriptLine({ line }: { line: Line }) {
  switch (line.kind) {
    case "prompt":
      return <TypedPrompt line={line} />;
    case "call":
      return (
        <div className="line-in">
          <p>
            <span className="text-emerald-400">●</span> wirely{" "}
            <span className="text-white/40">-</span> <span className="text-white">{line.tool}</span>
            <span className="text-white/45">({line.args})</span>
          </p>
          {line.result ? <p className="pl-5 text-white/55">⎿ {line.result}</p> : null}
        </div>
      );
    case "edit":
      return (
        <p className="line-in">
          <span className="text-emerald-400">●</span> Update{" "}
          <span className="text-white">{line.file}</span>
        </p>
      );
    case "note":
      return <p className="line-in pl-5 text-white/55">{line.text}</p>;
  }
}

/**
 * The session types itself out while it is on screen, holds on the finished
 * run, then clears and starts again. A timer advances one line at a time,
 * so there is nothing to repaint between lines.
 */
export default function LandingTranscript() {
  const box = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(0);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Under reduced motion the finished session shows as soon as it is seen.
        if (reduceMotion) setShown(LINES.length);
        else setIsLive(entry.isIntersecting);
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const finished = shown >= LINES.length;
    const delay = finished ? HOLD_SECONDS : shown === 0 ? 0.4 : lineDuration(LINES[shown - 1]);
    const timer = window.setTimeout(() => setShown(finished ? 0 : shown + 1), delay * 1000);
    return () => window.clearTimeout(timer);
  }, [isLive, shown]);

  return (
    <figure ref={box} className="window-dark overflow-hidden rounded-[14px]">
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3 text-[13px]">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex items-center gap-2 font-semibold text-white/90">
          <Image
            src="https://cdn.simpleicons.org/claude/d97757"
            alt=""
            width={14}
            height={14}
            unoptimized
            className="size-3.5"
          />
          Claude Code
        </span>
        <span className="ml-auto font-mono text-xs text-white/45">~/habit-tracker</span>
      </div>
      <div className="min-h-[29rem] space-y-3 px-5 py-5 font-mono text-[12.5px] leading-6 text-white/85">
        {LINES.slice(0, shown).map((line, index) => (
          <TranscriptLine key={`${index}-${shown >= LINES.length ? "done" : "run"}`} line={line} />
        ))}
        {shown < LINES.length ? (
          <p className="text-white/40">
            &gt;<span className="caret" aria-hidden="true" />
          </p>
        ) : null}
      </div>
    </figure>
  );
}
