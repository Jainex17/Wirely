"use client";

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { updateProjectComment } from "@/components/CommentsPanel";
import { CommentCard, CommentPin } from "@/components/ReviewComments";
import { useEditorStore } from "@/store/useEditorStore";

/**
 * Open review comments on one page frame. Each pin opens its comment, which
 * the owner can resolve or delete; resolved comments stay in the comments
 * panel and on the review page, where they can be reopened.
 */
export default function CanvasCommentPins({
  pageId,
  projectId,
}: {
  pageId: string;
  projectId: string;
}) {
  const pageComments = useEditorStore(
    useShallow((state) => state.comments.filter((comment) => comment.pageId === pageId)),
  );
  const activeCommentId = useEditorStore((state) => state.activeCommentId);
  const setActiveCommentId = useEditorStore((state) => state.setActiveCommentId);
  // Only the page holding the open card listens for a click outside it.
  const activeId = pageComments.some((comment) => comment.id === activeCommentId)
    ? activeCommentId
    : null;
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeId) return;
    const close = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) setActiveCommentId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [activeId, setActiveCommentId]);

  return pageComments.map((comment, index) => {
    if (comment.resolvedAt !== null) return null;
    const style = {
      left: comment.x,
      top: comment.y,
      transform: "scale(var(--canvas-inverse-zoom, 1))",
    };
    return (
      <div key={comment.id}>
        <CommentPin
          number={index + 1}
          isResolved={false}
          isActive={comment.id === activeId}
          onClick={() => setActiveCommentId(comment.id === activeId ? null : comment.id)}
          style={{ ...style, zIndex: 25 }}
        />
        {comment.id === activeId ? (
          <div
            ref={cardRef}
            className="absolute z-30 w-64 origin-top-left rounded-lg border border-border bg-popover p-2.5 shadow-xl"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <CommentCard
              comment={comment}
              number={index + 1}
              canDelete
              canResolve
              onDelete={() => void updateProjectComment(projectId, comment, "delete")}
              onToggleResolved={() =>
                void updateProjectComment(projectId, comment, { resolved: true })
              }
            />
          </div>
        ) : null}
      </div>
    );
  });
}
