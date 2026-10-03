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
  Plus,
  X,
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
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const dragIndexRef = React.useRef<number | null>(null);

  // Starts from the saved flow, which an agent may have set, so opening the
  // dialog and pressing play never quietly replaces it with canvas order.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const allIds = useEditorStore.getState().pages.map((page) => page.id);
    setIsLoading(true);
    void (async () => {
      let flow: { pageIds: string[]; startPageId: string | null } = {
        pageIds: allIds,
        startPageId: allIds[0] ?? null,
      };
      try {
        const response = await fetch(`/api/projects/${wireId}/prototype`);
        if (response.ok) flow = ((await response.json()) as { flow: typeof flow }).flow;
      } catch (error) {
        logger.warn("prototype_flow_load_failed", { wireId, error });
      }
      if (cancelled) return;
      setOrderedIds(flow.pageIds);
      setStartPageId(flow.startPageId);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, wireId]);

  const titleById = React.useMemo(() => {
    return new Map(pages.map((page) => [page.id, page.title]));
  }, [pages]);

  // A page deleted while the dialog is open drops out of both lists.
  const flowIds = orderedIds.filter((pageId) => titleById.has(pageId));
  const otherPages = pages.filter((page) => !orderedIds.includes(page.id));
  const flowStartId =
    startPageId && flowIds.includes(startPageId) ? startPageId : (flowIds[0] ?? null);

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= flowIds.length) return;
    setOrderedIds(reorderIds(flowIds, fromIndex, toIndex));
  };

  const handleDrop = (targetIndex: number) => {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    if (fromIndex === null || fromIndex === targetIndex) return;
    moveItem(fromIndex, targetIndex);
  };

  const handleOpenPrototype = async () => {
    if (flowIds.length === 0) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${wireId}/prototype`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageIds: flowIds,
          startPageId: flowStartId,
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
            order. Screens you remove stay on the canvas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
            {flowIds.map((pageId, index) => (
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
                {flowStartId === pageId ? (
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
                    disabled={index === flowIds.length - 1}
                    onClick={() => moveItem(index, index + 1)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
                  aria-label="Remove from prototype"
                  title="Remove from prototype"
                  disabled={flowIds.length === 1}
                  onClick={() => setOrderedIds(flowIds.filter((id) => id !== pageId))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {flowIds.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">
                The screens in this prototype were deleted. Add at least one screen below.
              </li>
            ) : null}
            {otherPages.length > 0 ? (
              <li className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Not in the prototype
              </li>
            ) : null}
            {otherPages.map((page) => (
              <li
                key={page.id}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {page.title || "Untitled screen"}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                  aria-label="Add to prototype"
                  title="Add to prototype"
                  onClick={() => setOrderedIds([...flowIds, page.id])}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleOpenPrototype();
            }}
            disabled={isLoading || isSaving || flowIds.length === 0}
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
