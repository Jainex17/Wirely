"use client";

import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Frame,
  Image as ImageIcon,
  MousePointerClick,
  PenTool,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  buildLayerTree,
  findLayerParent,
  type InsertPosition,
  type Layer,
  type LayerKind,
  setNodeHidden,
} from "@/lib/pageTree";
import { cn } from "@/lib/utils";
import { commitPageEdit, moveElement, runElementAction } from "@/store/pageEdits";
import { useEditorStore } from "@/store/useEditorStore";

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
 * The focused page's elements as a tree, like Figma's layers list. Click a
 * row to pick the element, drag it to reorder or nest it, and use the row and
 * header buttons to hide, duplicate, wrap, or delete. Every change goes
 * through `commitPageEdit`, so Cmd+Z takes it back.
 */
export default function LayersPanel({ projectId }: { projectId: string }) {
  const { page, selectedNode } = useEditorStore(
    useShallow((state) => ({
      page: state.pages.find((candidate) => candidate.id === state.focusedPageId),
      selectedNode: state.selectedNode,
    })),
  );
  const html = page?.iframeHtml ?? "";
  const layers = useMemo(() => (html ? buildLayerTree(html) : []), [html]);
  // Rows the user opened or closed. The rest follow INITIALLY_OPEN_DEPTH.
  const [openById, setOpenById] = useState<Record<string, boolean>>({});
  const [drop, setDrop] = useState<{ id: string; position: InsertPosition } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const selectedId = selectedNode && selectedNode.pageId === page?.id ? selectedNode.nodeId : null;

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

  if (!page) return null;

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

  const select = (layer: Layer) =>
    useEditorStore.getState().setSelectedNode({
      pageId: page.id,
      nodeId: layer.id,
      tag: layer.tag,
      color: null,
      background: null,
    });

  const dropPosition = (event: DragEvent<HTMLDivElement>, layer: Layer): InsertPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (ratio < 0.3) return "before";
    if (ratio > 0.7) return "after";
    return layer.kind === "image" || layer.kind === "vector" ? "after" : "inside";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 px-3">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          Layers <span className="font-normal text-muted-foreground">in {page.title}</span>
        </span>
        {selectedId ? (
          <>
            <HeaderButton label="Duplicate (Cmd+D)" onClick={() => runElementAction(projectId, "duplicate")}>
              <Copy className="h-3.5 w-3.5" />
            </HeaderButton>
            <HeaderButton label="Wrap in frame (Cmd+Alt+G)" onClick={() => runElementAction(projectId, "wrap")}>
              <Frame className="h-3.5 w-3.5" />
            </HeaderButton>
            <HeaderButton label="Delete (Delete)" onClick={() => runElementAction(projectId, "delete")}>
              <Trash2 className="h-3.5 w-3.5" />
            </HeaderButton>
          </>
        ) : null}
      </div>
      <div role="tree" aria-label="Layers" className="min-h-0 flex-1 overflow-y-auto pb-2">
        {rows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">This page has no elements yet.</p>
        ) : null}
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
                event.dataTransfer.setData(LAYER_DRAG_TYPE, layer.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) return;
                event.preventDefault();
                const position = dropPosition(event, layer);
                setDrop((current) =>
                  current?.id === layer.id && current.position === position ? current : { id: layer.id, position },
                );
              }}
              onDragLeave={() => setDrop((current) => (current?.id === layer.id ? null : current))}
              onDrop={(event) => {
                const draggedId = event.dataTransfer.getData(LAYER_DRAG_TYPE);
                event.preventDefault();
                setDrop(null);
                if (draggedId && draggedId !== layer.id) {
                  moveElement(projectId, page.id, draggedId, layer.id, dropPosition(event, layer));
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
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {dropHere === "before" || dropHere === "after" ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute right-0 h-0.5 bg-primary",
                    dropHere === "before" ? "top-0" : "bottom-0",
                  )}
                  style={{ left: 8 + depth * 12 }}
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
                  commitPageEdit(projectId, page.id, (source) =>
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
    </div>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
    >
      {children}
    </button>
  );
}
