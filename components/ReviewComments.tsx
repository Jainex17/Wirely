"use client";

import { Check, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectComment } from "@/lib/projectComments";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * A numbered pin at a comment's spot on the page. `scale` counter-sizes it,
 * so it stays the same on screen however the page is zoomed.
 */
export function CommentPin({
  number,
  isResolved,
  isActive,
  onClick,
  style,
}: {
  number: number;
  isResolved: boolean;
  isActive: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={`Comment ${number}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute flex h-6 min-w-6 origin-bottom-left -translate-y-full items-center justify-center rounded-full rounded-bl-none px-1.5 text-[11px] font-semibold shadow-md ring-2 ring-white",
        isResolved ? "bg-zinc-400 text-white" : "bg-violet-600 text-white",
        isActive && "ring-violet-300",
      )}
      style={style}
    >
      {number}
    </button>
  );
}

/** One comment with the actions the viewer is allowed to take on it. */
export function CommentCard({
  comment,
  number,
  canDelete,
  canResolve,
  onDelete,
  onToggleResolved,
}: {
  comment: ProjectComment;
  number: number;
  canDelete: boolean;
  canResolve: boolean;
  onDelete: () => void;
  onToggleResolved: () => void;
}) {
  const isResolved = comment.resolvedAt !== null;
  return (
    <div className={cn("text-xs", isResolved && "opacity-60")}>
      <div className="flex items-center gap-2">
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">
          {number}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {comment.authorName}
        </span>
        {canResolve ? (
          <button
            type="button"
            onClick={onToggleResolved}
            title={isResolved ? "Reopen" : "Resolve"}
            aria-label={isResolved ? "Reopen comment" : "Resolve comment"}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {isResolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            aria-label="Delete comment"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{comment.body}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {timeFormat.format(new Date(comment.createdAt))}
        {isResolved ? " · Resolved" : ""}
      </p>
    </div>
  );
}

/** Numbers each comment by its order on its own page, oldest first. */
export const numberCommentsByPage = (comments: ProjectComment[]) => {
  const counts = new Map<string, number>();
  const numbers = new Map<string, number>();
  for (const comment of comments) {
    const next = (counts.get(comment.pageId) ?? 0) + 1;
    counts.set(comment.pageId, next);
    numbers.set(comment.id, next);
  }
  return numbers;
};
