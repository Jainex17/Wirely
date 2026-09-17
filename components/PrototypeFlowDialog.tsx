"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Flag,
  GripVertical,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEditorStore } from "@/store/useEditorStore";

interface PrototypeFlowDialogProps {
  wireId: string;
  projectTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const reorderIds = (ids: string[], fromIndex: number, toIndex: number) => {
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

export default function PrototypeFlowDialog({
  wireId,
  projectTitle,
  open,
  onOpenChange,
}: PrototypeFlowDialogProps) {
  const router = useRouter();
  const pages = useEditorStore((state) => state.pages);
  const [orderedIds, setOrderedIds] = React.useState<string[]>([]);
  const [startPageId, setStartPageId] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const dragIndexRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const storePages = useEditorStore.getState().pages;
    const ids = storePages.map((page) => page.id);
    setOrderedIds(ids);
    setStartPageId((current) =>
      current && ids.includes(current) ? current : (ids[0] ?? null),
    );
  }, [open, pages]);

  const titleById = React.useMemo(() => {
    return new Map(pages.map((page) => [page.id, page.title]));
  }, [pages]);

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= orderedIds.length) return;
    setOrderedIds((current) => reorderIds(current, fromIndex, toIndex));
  };

  const handleDrop = (targetIndex: number) => {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    if (fromIndex === null || fromIndex === targetIndex) return;
    moveItem(fromIndex, targetIndex);
  };

  const handleOpenPrototype = async () => {
    if (orderedIds.length === 0) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${wireId}/prototype`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageIds: orderedIds,
          startPageId: startPageId ?? orderedIds[0],
        }),
      });
      if (!response.ok) {
        throw new Error(`Prototype flow save failed with status ${response.status}`);
      }
      onOpenChange(false);
      router.push(`/wire/${wireId}/prototype`);
    } catch (error) {
      logger.error("prototype_flow_open_failed", { wireId, error });
      toast.error("Could not open the prototype. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Prototype</DialogTitle>
          <DialogDescription>
            Arrange the screen flow for &quot;{projectTitle}&quot;. The start
            screen opens first, then viewers move through the flow in this
            order.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
          {orderedIds.map((pageId, index) => (
            <li
              key={pageId}
              draggable
              onDragStart={() => {
                dragIndexRef.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-2"
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
              <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {titleById.get(pageId) ?? "Untitled screen"}
              </span>
              {startPageId === pageId ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  <Play className="h-2.5 w-2.5" />
                  Start
                </span>
              ) : null}
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                aria-label="Set as start screen"
                title="Set as start screen"
                onClick={() => setStartPageId(pageId)}
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveItem(index, index - 1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
                  aria-label="Move down"
                  disabled={index === orderedIds.length - 1}
                  onClick={() => moveItem(index, index + 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleOpenPrototype();
            }}
            disabled={isSaving || orderedIds.length === 0}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Open Prototype
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
