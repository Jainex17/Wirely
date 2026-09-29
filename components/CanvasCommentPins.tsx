"use client";

import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CommentCard, CommentPin } from "@/components/ReviewComments";
import { toast } from "@/components/ui/sonner";
import type { ProjectComment } from "@/lib/projectComments";
import { useEditorStore } from "@/store/useEditorStore";

/**
 * Open review comments on one page frame. Each pin opens its comment, which
 * the owner can resolve or delete; resolved comments stay on the review page,
 * where they can be reopened.
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeId) return;
    const close = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) setActiveId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [activeId]);

  const update = async (comment: ProjectComment, method: "PATCH" | "DELETE") => {
    const response = await fetch(`/api/projects/${projectId}/comments/${comment.id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "PATCH" ? JSON.stringify({ resolved: true }) : undefined,
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Could not update the comment.");
      return;
    }
    const { comments, setComments } = useEditorStore.getState();
    setComments(
      method === "DELETE"
        ? comments.filter((candidate) => candidate.id !== comment.id)
        : comments.map((candidate) =>
            candidate.id === comment.id
              ? { ...candidate, resolvedAt: new Date().toISOString() }
              : candidate,
          ),
    );
    setActiveId(null);
    if (method === "PATCH") toast.success("Comment resolved.");
  };

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
          onClick={() => setActiveId(comment.id === activeId ? null : comment.id)}
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
              onDelete={() => void update(comment, "DELETE")}
              onToggleResolved={() => void update(comment, "PATCH")}
            />
          </div>
        ) : null}
      </div>
    );
  });
}
