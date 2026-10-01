"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  describeAgentTool,
  groupAgentActivity,
  isReadTool,
  type AgentActivityEntry,
} from "@/lib/agentActivity";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/useEditorStore";

const POLL_INTERVAL_MS = 4_000;
// Rows list this many of their folded calls' details before "and N more".
const MAX_SHOWN_DETAILS = 3;
// An agent that called a tool this recently is treated as still working.
const WORKING_WINDOW_MS = 60_000;

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const formatAgo = (iso: string, now: number) => {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (seconds > -45) return "just now";
  if (seconds > -3600) return relativeTime.format(Math.round(seconds / 60), "minute");
  if (seconds > -86_400) return relativeTime.format(Math.round(seconds / 3600), "hour");
  return relativeTime.format(Math.round(seconds / 86_400), "day");
};

/**
 * The MCP tool calls agents made on this project. Polls only while the tab is
 * shown and the browser tab is visible, so a closed tab costs no requests.
 */
export default function AgentActivityPanel({
  projectId,
  isActive,
}: {
  projectId: string;
  isActive: boolean;
}) {
  const [entries, setEntries] = useState<AgentActivityEntry[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pages = useEditorStore((state) => state.pages);
  const focusPage = useEditorStore((state) => state.focusPage);

  useEffect(() => {
    if (!isActive) return;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/projects/${projectId}/activity`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { activity?: AgentActivityEntry[] };
        if (payload.activity) setEntries(payload.activity);
        setNow(Date.now());
      } catch {
        // A dropped load is retried on the next tick.
      }
    };

    void load();
    const intervalId = window.setInterval(load, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", load);
    };
  }, [isActive, projectId]);

  const rows = useMemo(() => groupAgentActivity(entries ?? []), [entries]);
  const pageTitles = useMemo(
    () => new Map(pages.map((page) => [page.id, page.title])),
    [pages],
  );

  if (entries === null) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">Loading activity…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <p>No agent has worked on this project yet.</p>
        <p className="mt-2">
          Connect Claude Code, Cursor, or Codex in{" "}
          <Link href="/setting?tab=mcp" className="text-foreground underline underline-offset-2">
            MCP settings
          </Link>
          . Every page it reads or writes shows up here.
        </p>
      </div>
    );
  }

  const isWorking = now - new Date(rows[0].createdAt).getTime() < WORKING_WINDOW_MS;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-4 py-2 text-xs">
        <span
          className={cn("h-2 w-2 rounded-full", isWorking ? "bg-emerald-500" : "bg-muted-foreground/40")}
        />
        <span className="text-foreground">
          {isWorking ? "Agent is working" : `Last active ${formatAgo(rows[0].createdAt, now)}`}
        </span>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto py-1">
        {rows.map((row, index) => {
          const pageTitle = row.pageId ? pageTitles.get(row.pageId) : undefined;
          const isRead = isReadTool(row.tool);
          const ago = formatAgo(row.createdAt, now);
          // A burst of calls shares one time label, on its first row.
          const showTime = index === 0 || formatAgo(rows[index - 1].createdAt, now) !== ago;
          return (
            <li key={row.id}>
              {showTime ? (
                <p className="px-4 pb-0.5 pt-2 text-[11px] text-muted-foreground">{ago}</p>
              ) : null}
              <button
                type="button"
                disabled={!pageTitle}
                onClick={() => row.pageId && focusPage(row.pageId)}
                title={pageTitle ? `Go to "${pageTitle}"` : undefined}
                className="flex w-full flex-col gap-0.5 px-4 py-1 text-left text-xs enabled:hover:bg-foreground/5"
              >
                <span className="flex w-full min-w-0 items-baseline gap-1.5">
                  <span
                    className={cn(
                      "shrink-0",
                      row.error
                        ? "text-destructive"
                        : isRead
                          ? "text-muted-foreground"
                          : "font-medium text-foreground",
                    )}
                  >
                    {describeAgentTool(row.tool)}
                    {row.error ? " failed" : ""}
                  </span>
                  {row.pageId ? (
                    <span className="min-w-0 truncate text-muted-foreground">
                      {pageTitle ?? "a deleted page"}
                    </span>
                  ) : null}
                  {row.count > 1 ? (
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                      {row.count}×
                    </span>
                  ) : null}
                </span>
                {row.details.slice(0, MAX_SHOWN_DETAILS).map((detail) => (
                  <span key={detail} className="line-clamp-2 text-[11px] text-foreground/80">
                    {detail}
                  </span>
                ))}
                {row.details.length > MAX_SHOWN_DETAILS ? (
                  <span className="text-[11px] text-muted-foreground">
                    and {row.details.length - MAX_SHOWN_DETAILS} more
                  </span>
                ) : null}
                {row.error ? (
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">{row.error}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
