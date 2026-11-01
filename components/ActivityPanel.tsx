"use client";

import { CheckCircle2, FilePlus2, MessageCircle, PencilLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { type ActivityItem, buildActivityFeed, type PageActivitySource } from "@/lib/projectActivity";
import { useEditorStore } from "@/store/useEditorStore";

/** Waits for a burst of page writes to settle before asking for the new times. */
const REFRESH_DELAY_MS = 2_000;

const ICONS = {
  page_added: FilePlus2,
  page_edited: PencilLine,
  comment_added: MessageCircle,
  comment_resolved: CheckCircle2,
} as const;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const describe = (item: ActivityItem, pageTitle: string) => {
  switch (item.kind) {
    case "page_added":
      return `${pageTitle} added`;
    case "page_edited":
      return `${pageTitle} edited`;
    case "comment_added":
      return `${item.authorName} commented on ${pageTitle}`;
    case "comment_resolved":
      return `Comment on ${pageTitle} resolved`;
  }
};

/**
 * The right panel's Activity tab: pages added and edited, and comments left
 * and resolved, newest first. A row takes the canvas to its page or comment.
 * Page times come from the server and refresh after the pages change.
 */
export default function ActivityPanel({ projectId }: { projectId: string }) {
  const { pages, comments, focusPage, focusComment } = useEditorStore(
    useShallow((state) => ({
      pages: state.pages,
      comments: state.comments,
      focusPage: state.focusPage,
      focusComment: state.focusComment,
    })),
  );
  const [source, setSource] = useState<PageActivitySource | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/activity`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`activity ${response.status}`);
          setSource((await response.json()) as PageActivitySource);
          setFailed(false);
        } catch {
          if (!controller.signal.aborted) setFailed(true);
        }
      },
      source ? REFRESH_DELAY_MS : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `source` only picks the first delay; refetching on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pages]);

  const titleById = useMemo(() => new Map(pages.map((page) => [page.id, page.title])), [pages]);
  const items = useMemo(
    () =>
      source
        ? buildActivityFeed({ ...source, comments }).filter((item) => titleById.has(item.pageId))
        : [],
    [source, comments, titleById],
  );

  if (!source) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground">
        {failed ? "Could not load activity." : "Loading activity..."}
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">Nothing has happened in this project yet.</p>;
  }

  return (
    <ul className="p-2">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        const pageTitle = titleById.get(item.pageId) ?? "";
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() =>
                item.kind === "comment_added" || item.kind === "comment_resolved"
                  ? focusComment(item.commentId)
                  : focusPage(item.pageId)
              }
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-foreground/5"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-foreground">{describe(item, pageTitle)}</span>
                {item.kind === "comment_added" ? (
                  <span className="block truncate text-xs text-muted-foreground">{item.body}</span>
                ) : null}
                <span className="block text-[11px] tabular-nums text-muted-foreground">{formatTime(item.at)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
