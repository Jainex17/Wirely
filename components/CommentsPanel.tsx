"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CommentCard, numberCommentsByPage } from "@/components/ReviewComments";
import { toast } from "@/components/ui/sonner";
import type { ProjectComment } from "@/lib/projectComments";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/useEditorStore";

/** Resolves, reopens, or deletes a comment as the project owner, then updates the store. */
export const updateProjectComment = async (
  projectId: string,
  comment: ProjectComment,
  change: { resolved: boolean } | "delete",
) => {
  const response = await fetch(`/api/projects/${projectId}/comments/${comment.id}`, {
    method: change === "delete" ? "DELETE" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: change === "delete" ? undefined : JSON.stringify(change),
  }).catch(() => null);
  if (!response?.ok) {
    toast.error("Could not update the comment.");
    return;
  }
  const { comments, setComments, activeCommentId, setActiveCommentId } =
    useEditorStore.getState();
  setComments(
    change === "delete"
      ? comments.filter((candidate) => candidate.id !== comment.id)
      : comments.map((candidate) =>
          candidate.id === comment.id
            ? { ...candidate, resolvedAt: change.resolved ? new Date().toISOString() : null }
            : candidate,
        ),
  );
  if (activeCommentId === comment.id) setActiveCommentId(null);
  if (change !== "delete") toast.success(change.resolved ? "Comment resolved." : "Comment reopened.");
};

/**
 * Every comment on the project, grouped by page, shown in the right sidebar
 * while the comment tool is active, as Figma does. Clicking one pans the
 * canvas to its pin and opens it.
 */
export default function CommentsPanel({ projectId }: { projectId: string }) {
  const { comments, pages, activeCommentId, focusComment } = useEditorStore(
    useShallow((state) => ({
      comments: state.comments,
      pages: state.pages,
      activeCommentId: state.activeCommentId,
      focusComment: state.focusComment,
    })),
  );
  const [showResolved, setShowResolved] = useState(false);
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  const numbers = useMemo(() => numberCommentsByPage(comments), [comments]);
  const groups = pages
    .map((page) => ({
      page,
      comments: comments.filter(
        (comment) =>
          comment.pageId === page.id && (showResolved || comment.resolvedAt === null),
      ),
    }))
    .filter((group) => group.comments.length > 0);
  const openCount = comments.filter((comment) => comment.resolvedAt === null).length;

  // A pin opened on the canvas brings its row into view.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeCommentId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {openCount} open {openCount === 1 ? "comment" : "comments"}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No comments yet. Click a page to leave one.
          </p>
        ) : (
          groups.map(({ page, comments: pageComments }) => (
            <section key={page.id} className="mb-3">
              <h3 className="truncate px-1 pb-1 text-[11px] font-semibold text-muted-foreground">
                {page.title}
              </h3>
              <ul className="space-y-1">
                {pageComments.map((comment) => (
                  <li
                    key={comment.id}
                    ref={comment.id === activeCommentId ? activeRowRef : undefined}
                    className={cn(
                      "cursor-pointer rounded-md p-2 hover:bg-accent/60",
                      comment.id === activeCommentId && "bg-accent",
                    )}
                    onClick={(event) => {
                      // The card's own buttons act on the comment without moving the canvas.
                      if ((event.target as Element).closest("button")) return;
                      focusComment(comment.id);
                    }}
                  >
                    <CommentCard
                      comment={comment}
                      number={numbers.get(comment.id) ?? 0}
                      canDelete
                      canResolve
                      onDelete={() => void updateProjectComment(projectId, comment, "delete")}
                      onToggleResolved={() =>
                        void updateProjectComment(projectId, comment, {
                          resolved: comment.resolvedAt === null,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
