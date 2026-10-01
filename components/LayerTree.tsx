"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Eye,
  EyeOff,
  Frame,
  Image as ImageIcon,
  MousePointerClick,
  PenTool,
  Square,
  Type,
} from "lucide-react";
import {
  buildLayerTree,
  findLayerParent,
  type InsertPosition,
  type Layer,
  type LayerKind,
  setNodeHidden,
} from "@/lib/pageTree";
import { cn } from "@/lib/utils";
import { commitPageEdit, moveElement } from "@/store/pageEdits";
import { useEditorStore } from "@/store/useEditorStore";

// The page id is part of the type because dragover can read only the types,
// and a layer may only be dropped on its own page.
const LAYER_DRAG_TYPE = "application/x-wirely-layer";

const KIND_ICONS: Record<LayerKind, typeof Square> = {
  frame: Frame,
  text: Type,
  image: ImageIcon,
  vector: PenTool,
  control: MousePointerClick,
  other: Square,
};

// Deeper levels open as the user picks into them, so a long page starts short.
const INITIALLY_OPEN_DEPTH = 2;

/**
 * One page's elements as a tree, like Figma's layers list, rendered under the
 * page's row in the pages panel. Click a row to pick the element, drag it to
 * reorder or nest it, and use the eye to hide it. Every change goes through
 * `commitPageEdit`, so Cmd+Z takes it back.
 */
export default function LayerTree({
  projectId,
  pageId,
  html,
  baseDepth,
}: {
  projectId: string;
  pageId: string;
  html: string;
  /** Tree levels above the page's first layer, for the row indent. */
  baseDepth: number;
}) {
  const selectedNode = useEditorStore((state) => state.selectedNode);
  const layers = useMemo(() => (html ? buildLayerTree(html) : []), [html]);
  // Rows the user opened or closed. The rest follow INITIALLY_OPEN_DEPTH.
  const [openById, setOpenById] = useState<Record<string, boolean>>({});
  const [drop, setDrop] = useState<{ id: string; position: InsertPosition } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const dragType = `${LAYER_DRAG_TYPE}-${pageId}`;

  const selectedId = selectedNode && selectedNode.pageId === pageId ? selectedNode.nodeId : null;

  // A newly picked element opens the rows above it, once, so the user can
  // still collapse them after. Adjusted during render, not in an effect.
  const [revealedId, setRevealedId] = useState<string | null>(null);
  if (selectedId && selectedId !== revealedId) {
    setRevealedId(selectedId);
    const ancestors: string[] = [];
    for (let parent = findLayerParent(layers, selectedId); parent; parent = findLayerParent(layers, parent)) {
      ancestors.push(parent);
    }
    if (ancestors.some((id) => openById[id] !== true)) {
      setOpenById({ ...openById, ...Object.fromEntries(ancestors.map((id) => [id, true])) });
    }
  }

  useEffect(() => {
    if (selectedId) rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, openById]);

  const isOpen = (layer: Layer, depth: number) =>
    openById[layer.id] ?? depth < INITIALLY_OPEN_DEPTH;

  const toggle = (layer: Layer, depth: number) =>
    setOpenById((current) => ({ ...current, [layer.id]: !isOpen(layer, depth) }));

  const rows: Array<{ layer: Layer; depth: number }> = [];
  const collect = (list: Layer[], depth: number) => {
    for (const layer of list) {
      rows.push({ layer, depth });
      if (layer.children.length > 0 && isOpen(layer, depth)) collect(layer.children, depth + 1);
    }
  };
  collect(layers, 0);

  const indent = (depth: number) => 8 + (baseDepth + depth) * 12;

  const select = (layer: Layer) => {
    const { setFocusedPage, setSelectedNode } = useEditorStore.getState();
    setFocusedPage(pageId);
    setSelectedNode({ pageId, nodeId: layer.id, tag: layer.tag, color: null, background: null });
  };

  const dropPosition = (event: DragEvent<HTMLDivElement>, layer: Layer): InsertPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (ratio < 0.3) return "before";
    if (ratio > 0.7) return "after";
    return layer.kind === "image" || layer.kind === "vector" ? "after" : "inside";
  };

  if (rows.length === 0) {
    return (
      <p className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: indent(0) + 20 }}>
        No elements yet
      </p>
    );
  }

  return (
    <div role="group">
      {rows.map(({ layer, depth }) => {
        const Icon = KIND_ICONS[layer.kind];
        const isSelected = layer.id === selectedId;
        const dropHere = drop?.id === layer.id ? drop.position : null;
        return (
          <div
            key={layer.id}
            ref={(element) => {
              if (element) rowRefs.current.set(layer.id, element);
              else rowRefs.current.delete(layer.id);
            }}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={layer.children.length > 0 ? isOpen(layer, depth) : undefined}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(dragType, layer.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(dragType)) return;
              event.preventDefault();
              event.stopPropagation();
              const position = dropPosition(event, layer);
              setDrop((current) =>
                current?.id === layer.id && current.position === position ? current : { id: layer.id, position },
              );
            }}
            onDragLeave={() => setDrop((current) => (current?.id === layer.id ? null : current))}
            onDrop={(event) => {
              const draggedId = event.dataTransfer.getData(dragType);
              if (!draggedId) return;
              event.preventDefault();
              event.stopPropagation();
              setDrop(null);
              if (draggedId !== layer.id) {
                moveElement(projectId, pageId, draggedId, layer.id, dropPosition(event, layer));
              }
            }}
            onDragEnd={() => setDrop(null)}
            onClick={() => select(layer)}
            className={cn(
              "group relative flex h-7 cursor-default items-center gap-1.5 pr-2 text-xs",
              isSelected
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              layer.hidden && "opacity-50",
              dropHere === "inside" && "ring-1 ring-inset ring-primary",
            )}
            style={{ paddingLeft: indent(depth) }}
          >
            {dropHere === "before" || dropHere === "after" ? (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute right-0 h-0.5 bg-primary",
                  dropHere === "before" ? "top-0" : "bottom-0",
                )}
                style={{ left: indent(depth) }}
              />
            ) : null}
            {layer.children.length > 0 ? (
              <button
                type="button"
                aria-label={isOpen(layer, depth) ? "Collapse" : "Expand"}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(layer, depth);
                }}
                className="-ml-0.5 rounded p-0.5 hover:bg-foreground/10"
              >
                <ChevronRight
                  className={cn("h-3 w-3 transition-transform", isOpen(layer, depth) && "rotate-90")}
                />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <Icon className={cn("h-3.5 w-3.5 shrink-0", isSelected && "text-primary")} />
            <span className="min-w-0 flex-1 truncate">{layer.label}</span>
            <button
              type="button"
              aria-label={layer.hidden ? "Show" : "Hide"}
              title={layer.hidden ? "Show" : "Hide"}
              onClick={(event) => {
                event.stopPropagation();
                commitPageEdit(projectId, pageId, (source) =>
                  setNodeHidden(source, layer.id, !layer.hidden),
                );
              }}
              className={cn(
                "rounded p-0.5 hover:bg-foreground/10",
                layer.hidden ? "visible" : "invisible group-hover:visible",
              )}
            >
              {layer.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
