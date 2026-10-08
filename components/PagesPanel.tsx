"use client";

import { type DragEvent, type ReactNode, useState } from "react";
import {
  ChevronRight,
  Copy,
  Frame,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import AssetsFolder from "@/components/AssetsFolder";
import LayerTree from "@/components/LayerTree";
import { cn } from "@/lib/utils";
import { ASSET_DRAG_TYPE, parseAssetDrag } from "@/lib/assetDrag";
import { insertAsset, runElementAction } from "@/store/pageEdits";
import { useEditorStore } from "@/store/useEditorStore";

const PAGE_DRAG_TYPE = "application/x-wirely-page";

interface PagesPanelProps {
  projectId: string;
  isCollapsed: boolean;
  onToggle: () => void;
  footer: ReactNode;
}

/**
 * The editor's left column: one tree of every page on the canvas with each
 * page's layers nested under it, and the account menu. Clicking a page pans
 * the canvas to it at the current zoom; dragging it onto a group moves it in or
 * out. The focused page opens by default. Collapsed, the column shrinks to a
 * floating button over the canvas, in the corner where its toggle was.
 */
export default function PagesPanel({
  projectId,
  isCollapsed,
  onToggle,
  footer,
}: PagesPanelProps) {
  const { pages, pageGroups, focusedPageId, selectedNode, focusPage, focusPages, movePageToGroup } =
    useEditorStore(
      useShallow((state) => ({
        pages: state.pages,
        pageGroups: state.pageGroups,
        focusedPageId: state.focusedPageId,
        selectedNode: state.selectedNode,
        focusPage: state.focusPage,
        focusPages: state.focusPages,
        movePageToGroup: state.movePageToGroup,
      })),
    );
  // Pages the user opened or closed. The rest are open only while focused.
  const [openByPageId, setOpenByPageId] = useState<Record<string, boolean>>({});
  const isPageOpen = (pageId: string) => openByPageId[pageId] ?? pageId === focusedPageId;
  // An element picked on the canvas reopens its page, once per pick.
  const [revealedNodeId, setRevealedNodeId] = useState<string | null>(null);
  if (selectedNode && selectedNode.nodeId !== revealedNodeId) {
    setRevealedNodeId(selectedNode.nodeId);
    if (openByPageId[selectedNode.pageId] === false) {
      setOpenByPageId({ ...openByPageId, [selectedNode.pageId]: true });
    }
  }
  const groupedPageIds = new Set(pageGroups.flatMap((group) => group.pageIds));
  // Rows drag with native drag and drop: drop a page on a group to move it in,
  // or on the ungrouped list to move it out. `undefined` means no drop target.
  const [dropGroupId, setDropGroupId] = useState<string | null | undefined>(undefined);

  const dropTargetProps = (groupId: string | null) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      setDropGroupId(groupId);
    },
    onDragLeave: (event: DragEvent) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDropGroupId(undefined);
    },
    onDrop: (event: DragEvent) => {
      const pageId = event.dataTransfer.getData(PAGE_DRAG_TYPE);
      if (!pageId) return;
      event.preventDefault();
      event.stopPropagation();
      setDropGroupId(undefined);
      movePageToGroup(pageId, groupId);
    },
  });

  const renderPage = (page: (typeof pages)[number], depth: number) => {
    const Icon =
      page.deviceType === "mobile" ? Smartphone : page.deviceType === "vector" ? PenTool : Monitor;
    const isCurrent = focusedPageId === page.id;
    const isOpen = isPageOpen(page.id);
    return (
      <div key={page.id}>
        <div
          role="treeitem"
          aria-selected={isCurrent}
          aria-expanded={isOpen}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(PAGE_DRAG_TYPE, page.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDropGroupId(undefined)}
          // A project image dropped on a page row goes at the end of the page.
          onDragOver={(event) => {
            if (page.deviceType === "vector" || !event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => {
            const asset = page.deviceType === "vector" ? null : parseAssetDrag(event.dataTransfer.getData(ASSET_DRAG_TYPE));
            if (!asset) return;
            event.preventDefault();
            event.stopPropagation();
            insertAsset(projectId, page.id, asset, "end");
          }}
          onClick={() => focusPage(page.id)}
          className={cn(
            "flex h-7 w-full cursor-default items-center gap-1.5 pr-3 text-xs font-medium transition-colors",
            isCurrent
              ? "text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            isCurrent && selectedNode?.pageId !== page.id && "bg-primary/15",
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <button
            type="button"
            aria-label={isOpen ? `Hide layers of ${page.title}` : `Show layers of ${page.title}`}
            onClick={(event) => {
              event.stopPropagation();
              setOpenByPageId((current) => ({ ...current, [page.id]: !isOpen }));
            }}
            className="-ml-0.5 rounded p-0.5 hover:bg-foreground/10"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
          </button>
          <Icon className={cn("h-3.5 w-3.5 shrink-0", isCurrent && "text-primary")} />
          <span className="truncate">{page.title}</span>
        </div>
        {isOpen ? (
          <LayerTree
            projectId={projectId}
            pageId={page.id}
            html={page.iframeHtml ?? ""}
            baseDepth={depth + 1}
            acceptsImages={page.deviceType !== "vector"}
          />
        ) : null}
      </div>
    );
  };

  const toggle = (
    <HeaderButton label={isCollapsed ? "Show pages panel" : "Hide pages panel"} onClick={onToggle}>
      {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </HeaderButton>
  );

  if (isCollapsed) {
    return (
      <div className="absolute left-3 top-3 z-30 rounded-lg border border-sidebar-border bg-sidebar p-0.5">
        {toggle}
      </div>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
      <div className="flex h-9 shrink-0 items-center gap-1 pl-3 pr-1.5">
        <span className="text-[11px] font-semibold text-foreground">Pages</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{pages.length}</span>
        <div className="ml-auto flex items-center">
          {selectedNode ? (
            <div className="mr-1 flex items-center border-r border-sidebar-border pr-1">
              <HeaderButton label="Duplicate element (Cmd+D)" onClick={() => runElementAction(projectId, "duplicate")}>
                <Copy className="h-3.5 w-3.5" />
              </HeaderButton>
              <HeaderButton
                label="Wrap element in frame (Cmd+Alt+G)"
                onClick={() => runElementAction(projectId, "wrap")}
              >
                <Frame className="h-3.5 w-3.5" />
              </HeaderButton>
              <HeaderButton label="Delete element (Delete)" onClick={() => runElementAction(projectId, "delete")}>
                <Trash2 className="h-3.5 w-3.5" />
              </HeaderButton>
            </div>
          ) : null}
          {toggle}
        </div>
      </div>
      <nav role="tree" aria-label="Pages and layers" className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        {pageGroups.map((group) => (
          <div
            key={group.id}
            {...dropTargetProps(group.id)}
            className={cn(dropGroupId === group.id && "bg-primary/10 ring-1 ring-inset ring-primary/40")}
          >
            <button
              type="button"
              onClick={() => focusPages(group.pageIds)}
              className="flex h-7 w-full items-center gap-1.5 pl-2 pr-3 text-left text-xs font-medium text-foreground transition-colors hover:bg-foreground/5"
            >
              <span className="w-4 shrink-0" />
              <Frame className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{group.name}</span>
              <span className="ml-auto font-normal tabular-nums text-muted-foreground">
                {group.pageIds.length}
              </span>
            </button>
            {pages
              .filter((page) => group.pageIds.includes(page.id))
              .map((page) => renderPage(page, 1))}
          </div>
        ))}
        <div
          {...dropTargetProps(null)}
          className={cn("flex-1", dropGroupId === null && "bg-primary/10")}
        >
          {pages.filter((page) => !groupedPageIds.has(page.id)).map((page) => renderPage(page, 0))}
        </div>
      </nav>
      <AssetsFolder projectId={projectId} />
      <div className="flex shrink-0 items-center border-t border-sidebar-border p-2">
        {footer}
        <a
          href="https://github.com/Jainex17/Wirely/issues"
          target="_blank"
          rel="noreferrer"
          className="ml-auto px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Feedback
        </a>
      </div>
    </aside>
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
