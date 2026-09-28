"use client";

import React from "react";
import { MessageSquarePlus, Monitor, PenTool, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { CommentCard, CommentPin, numberCommentsByPage } from "@/components/ReviewComments";
import { getPageFrameSize } from "@/lib/canvasScene";
import { injectIframeHeightReporter } from "@/lib/frameHeightReporter";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { MAX_COMMENT_CHARS, type ProjectComment } from "@/lib/projectComments";
import type { PageDeviceType } from "@/lib/types";
import { cn } from "@/lib/utils";

// A review is live while people talk, so other reviewers' comments show up
// without a reload. A hidden tab skips its ticks.
const COMMENT_SYNC_INTERVAL_MS = 20_000;
const MAX_FRAME_HEIGHT = 20_000;
const STAGE_PADDING = 48;

interface SharePage {
  id: string;
  title: string;
  html: string;
  deviceType: PageDeviceType;
}

interface ShareViewerProps {
  token: string;
  projectId: string;
  projectTitle: string;
  pages: SharePage[];
  initialComments: ProjectComment[];
  currentUserId: string;
  isOwner: boolean;
}

/**
 * The review page behind a project's share link. Reviewers click a spot on a
 * page to pin a comment there. The page renders in the same sandbox as the
 * editor, at its full height so pins sit in page coordinates.
 */
export default function ShareViewer({
  token,
  projectId,
  projectTitle,
  pages,
  initialComments,
  currentUserId,
  isOwner,
}: ShareViewerProps) {
  const [pageId, setPageId] = React.useState(pages[0]?.id ?? "");
  const [comments, setComments] = React.useState(initialComments);
  const [showResolved, setShowResolved] = React.useState(false);
  const [activeCommentId, setActiveCommentId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ x: number; y: number; body: string } | null>(null);
  const [isPosting, setIsPosting] = React.useState(false);
  const [frameHeight, setFrameHeight] = React.useState(0);
  const [stageWidth, setStageWidth] = React.useState(0);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  const page = pages.find((candidate) => candidate.id === pageId) ?? pages[0];
  const frame = getPageFrameSize({ deviceType: page.deviceType, iframeHtml: page.html }, "desktop");
  const deviceWidth = frame.width;
  const height = Math.max(frameHeight, frame.height);
  const scale = stageWidth > 0 ? Math.min(1, (stageWidth - STAGE_PADDING) / deviceWidth) : 1;
  const reporterId = `wirely-share-${page.id}`;
  const srcDoc = React.useMemo(
    () => injectIframeHeightReporter(sanitizeIframeHtml(page.html), reporterId),
    [page.html, reporterId],
  );
  const numbers = React.useMemo(() => numberCommentsByPage(comments), [comments]);
  const pageComments = comments.filter(
    (comment) => comment.pageId === page.id && (showResolved || comment.resolvedAt === null),
  );

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setStageWidth(stage.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(entry.contentRect.width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; id?: unknown; height?: unknown } | null;
      if (data?.type !== "wirely-iframe-height" || data.id !== reporterId) return;
      if (typeof data.height !== "number" || !Number.isFinite(data.height)) return;
      setFrameHeight(Math.min(MAX_FRAME_HEIGHT, Math.ceil(data.height)));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [reporterId]);

  React.useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/share/projects/${token}/comments`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { comments?: ProjectComment[] };
        if (payload.comments) setComments(payload.comments);
      } catch {
        // A dropped refresh is retried on the next tick.
      }
    };
    const intervalId = window.setInterval(refresh, COMMENT_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token]);

  const openPage = (nextPageId: string) => {
    setPageId(nextPageId);
    setFrameHeight(0);
    setDraft(null);
    setActiveCommentId(null);
  };

  const postDraft = async () => {
    if (!draft?.body.trim() || isPosting) return;
    setIsPosting(true);
    try {
      const response = await fetch(`/api/share/projects/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: page.id, x: draft.x, y: draft.y, body: draft.body }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { comment?: ProjectComment; error?: string }
        | null;
      if (!response.ok || !payload?.comment) {
        throw new Error(payload?.error || "Could not post the comment.");
      }
      const created = payload.comment;
      setComments((current) => [...current, created]);
      setActiveCommentId(created.id);
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post the comment.");
    } finally {
      setIsPosting(false);
    }
  };

  const deleteComment = async (comment: ProjectComment) => {
    const response = await fetch(`/api/share/projects/${token}/comments/${comment.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Could not delete the comment.");
      return;
    }
    setComments((current) => current.filter((candidate) => candidate.id !== comment.id));
  };

  const toggleResolved = async (comment: ProjectComment) => {
    const resolved = comment.resolvedAt === null;
    const response = await fetch(`/api/projects/${projectId}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Could not update the comment.");
      return;
    }
    const resolvedAt = resolved ? new Date().toISOString() : null;
    setComments((current) =>
      current.map((candidate) =>
        candidate.id === comment.id ? { ...candidate, resolvedAt } : candidate,
      ),
    );
  };

  const renderCard = (comment: ProjectComment) => (
    <CommentCard
      comment={comment}
      number={numbers.get(comment.id) ?? 0}
      canDelete={isOwner || comment.authorUserId === currentUserId}
      canResolve={isOwner}
      onDelete={() => void deleteComment(comment)}
      onToggleResolved={() => void toggleResolved(comment)}
    />
  );

  return (
    <div className="flex h-screen w-full flex-col bg-muted text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{projectTitle}</p>
          <p className="text-[11px] text-muted-foreground">
            Click anywhere on a page to leave a comment.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved
        </label>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-border bg-card p-2" aria-label="Pages">
          {pages.map((candidate) => {
            const Icon =
              candidate.deviceType === "mobile"
                ? Smartphone
                : candidate.deviceType === "vector"
                  ? PenTool
                  : Monitor;
            const openCount = comments.filter(
              (comment) => comment.pageId === candidate.id && comment.resolvedAt === null,
            ).length;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => openPage(candidate.id)}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs",
                  candidate.id === page.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                {openCount > 0 ? (
                  <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-semibold text-white">
                    {openCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div ref={stageRef} className="min-w-0 flex-1 overflow-auto py-6">
          <div className="mx-auto" style={{ width: deviceWidth * scale, height: height * scale }}>
            <div
              className="relative origin-top-left"
              style={{ width: deviceWidth, height, transform: `scale(${scale})` }}
            >
              <iframe
                ref={iframeRef}
                key={page.id}
                title={page.title}
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                className="block h-full w-full rounded-md border-0 bg-background shadow-lg"
              />
              {/* Catches clicks for new pins. The page is a static mock, so
                  nothing in it needs the pointer. */}
              <div
                className="absolute inset-0 cursor-crosshair"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setActiveCommentId(null);
                  setDraft({
                    x: (event.clientX - rect.left) / scale,
                    y: (event.clientY - rect.top) / scale,
                    body: "",
                  });
                }}
              />
              {pageComments.map((comment) => (
                <CommentPin
                  key={comment.id}
                  number={numbers.get(comment.id) ?? 0}
                  isResolved={comment.resolvedAt !== null}
                  isActive={comment.id === activeCommentId}
                  onClick={() => {
                    setDraft(null);
                    setActiveCommentId(comment.id);
                  }}
                  style={{ left: comment.x, top: comment.y, transform: `scale(${1 / scale})` }}
                />
              ))}
              {draft ? (
                <div
                  className="absolute z-10 w-64 origin-top-left rounded-lg border border-border bg-card p-2 shadow-xl"
                  style={{ left: draft.x, top: draft.y, transform: `scale(${1 / scale})` }}
                >
                  <textarea
                    autoFocus
                    value={draft.body}
                    maxLength={MAX_COMMENT_CHARS}
                    rows={3}
                    placeholder="Add a comment"
                    aria-label="Comment"
                    onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        void postDraft();
                      }
                      if (event.key === "Escape") setDraft(null);
                    }}
                    className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!draft.body.trim() || isPosting}
                      onClick={() => void postDraft()}
                    >
                      <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
                      Post
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card p-3" aria-label="Comments">
          <h2 className="mb-2 text-xs font-semibold">Comments on {page.title}</h2>
          {pageComments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {pageComments.map((comment) => (
                <li
                  key={comment.id}
                  className={cn(
                    "rounded-md p-2",
                    comment.id === activeCommentId && "bg-accent",
                  )}
                  onClick={() => setActiveCommentId(comment.id)}
                >
                  {renderCard(comment)}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
