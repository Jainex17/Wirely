"use client";

import { type ReactNode, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getNodeTree, type NodeTreeItem, stampNodeIds } from "@/lib/pageNodes";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/useEditorStore";

// Rows step in by this much per level, from the page row's own indent.
const INDENT_PX = 12;

interface PageLayersProps {
  pageId: string;
  html: string;
  /** Left padding of the page row, so layers start one step inside it. */
  baseIndentPx: number;
}

/**
 * A page's elements as a layer tree under its row in the pages panel. Clicking
 * a layer selects that element on the canvas, the same as picking it with the
 * Element tool, so the inspector, the pen handles, and agent links all follow.
 */
export default function PageLayers({ pageId, html, baseIndentPx }: PageLayersProps) {
  // Stamped the same way the canvas stamps its srcdoc, so the ids match.
  const tree = useMemo(() => getNodeTree(stampNodeIds(html)), [html]);
  const selectedNodeId = useEditorStore((state) =>
    state.selectedNode?.pageId === pageId ? state.selectedNode.nodeId : null,
  );
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  if (tree.length === 0) {
    return (
      <p
        className="py-1 text-[11px] text-muted-foreground"
        style={{ paddingLeft: baseIndentPx + INDENT_PX }}
      >
        No layers yet
      </p>
    );
  }

  const select = (item: NodeTreeItem) => {
    const state = useEditorStore.getState();
    state.setFocusedPage(pageId);
    state.setSelectedNode({
      pageId,
      nodeId: item.nodeId,
      tag: item.tag,
      color: null,
      background: null,
    });
  };

  const toggle = (nodeId: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (!next.delete(nodeId)) next.add(nodeId);
      return next;
    });

  const renderItems = (items: NodeTreeItem[], depth: number): ReactNode =>
    items.map((item) => {
      const isOpen = openIds.has(item.nodeId);
      const isSelected = item.nodeId === selectedNodeId;
      return (
        <div key={item.nodeId}>
          <div
            className={cn(
              "flex h-6 items-center gap-1 pr-3 text-[11px]",
              isSelected
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
            style={{ paddingLeft: baseIndentPx + depth * INDENT_PX }}
          >
            {item.children.length > 0 ? (
              <button
                type="button"
                aria-label={isOpen ? `Collapse ${item.tag}` : `Expand ${item.tag}`}
                aria-expanded={isOpen}
                onClick={() => toggle(item.nodeId)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-foreground/10"
              >
                <ChevronRight
                  className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
                />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <button
              type="button"
              onClick={() => select(item)}
              className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
            >
              <span className={cn("shrink-0 font-mono", isSelected && "text-primary")}>
                {item.tag}
              </span>
              {item.label ? (
                <span className="truncate text-muted-foreground">{item.label}</span>
              ) : null}
            </button>
          </div>
          {isOpen ? renderItems(item.children, depth + 1) : null}
        </div>
      );
    });

  return <div>{renderItems(tree, 1)}</div>;
}
