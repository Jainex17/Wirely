"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "wirely:get-started-dismissed";
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const readDismissed = () => window.localStorage.getItem(DISMISSED_KEY) === "1";
// Hidden on the server, so the panel never flashes a card the user closed.
const readDismissedOnServer = () => true;

/**
 * The pages panel's nudge for a user whose agent has never called Wirely:
 * connect it, then ask it for pages. It goes away for good once an agent
 * makes a call, and the user can close it sooner, for example when they only
 * generate in the chat.
 */
export default function GetStartedCard() {
  const isDismissed = useSyncExternalStore(subscribe, readDismissed, readDismissedOnServer);
  if (isDismissed) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    listeners.forEach((listener) => listener());
  };

  return (
    <section className="mx-2 mb-2 shrink-0 rounded-lg border border-sidebar-border bg-background/60 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-foreground">Get started</h2>
        <button
          type="button"
          aria-label="Close get started"
          onClick={dismiss}
          className="-mr-1 rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ol className="mt-2 space-y-3">
        <li className="flex gap-2.5">
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Connect your agent</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Claude Code, Cursor, Codex, or any MCP client.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs">
              <Link href="/setting?tab=mcp">Connect</Link>
            </Button>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Ask it to design your first pages</p>
        </li>
      </ol>
    </section>
  );
}
