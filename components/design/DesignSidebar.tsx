"use client";

import type { Editor } from "@open-pencil/core/editor";
import type { SceneNode } from "@open-pencil/scene-graph";
import {
  ChevronRight,
  Circle,
  Component,
  Eye,
  EyeOff,
  Frame,
  Image as ImageIcon,
  Minus,
  Monitor,
  PenTool,
  Smartphone,
  Square,
  Type,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import AssetsFolder from "@/components/AssetsFolder";
import { AccountFooter, FloatingPanelToggle, PanelToggle } from "@/components/EditorChrome";
import type { UserAccountMenuUser } from "@/components/UserAccountMenu";
import { shallowEqual, useEditorValue } from "@/components/design/useEditorValue";
import { SCREEN_SIZES } from "@/lib/design/document";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Partial<Record<SceneNode["type"], typeof Frame>> = {
  FRAME: Frame,
  SECTION: Frame,
  GROUP: Frame,
  TEXT: Type,
  RECTANGLE: Square,
  ELLIPSE: Circle,
  LINE: Minus,
  VECTOR: PenTool,
  COMPONENT: Component,
  INSTANCE: Component,
};

function NodeIcon({ node, className }: { node: SceneNode; className: string }) {
  const Icon = node.fills.some((fill) => fill.type === "IMAGE") ? ImageIcon : (TYPE_ICONS[node.type] ?? Square);
  return <Icon className={className} />;
}

const typeName = (type: string) => type.charAt(0) + type.slice(1).toLowerCase();

/** The top-level frame holding `id`, which is the screen it belongs to. */
const screenOf = (editor: Editor, id: string) => {
  let node = editor.getNode(id);
  while (node?.parentId && editor.getNode(node.parentId)?.type !== "CANVAS") node = editor.getNode(node.parentId);
  return node ?? null;
};

const indent = (depth: number) => 8 + depth * 12;

/**
 * The Editor tab's left column, laid out like the Prototype tab's pages
 * panel: one tree of every screen with its layers nested under it, the
 * project's assets, and the account menu. The screen holding the selection
 * opens by default. Collapsed, it shrinks to a button over the canvas.
 */
export default function DesignSidebar({
  editor,
  projectId,
  user,
  isCollapsed,
  onToggle,
}: {
  editor: Editor | null;
  projectId: string;
  user: UserAccountMenuUser;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const toggle = <PanelToggle side="left" name="screens panel" isCollapsed={isCollapsed} onToggle={onToggle} />;
  if (isCollapsed) return <FloatingPanelToggle className="left-3">{toggle}</FloatingPanelToggle>;
  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
      {editor ? <ScreenTree editor={editor} toggle={toggle} /> : <div className="min-h-0 flex-1" />}
      <AssetsFolder projectId={projectId} />
      <AccountFooter user={user} />
    </aside>
  );
}

function ScreenTree({ editor, toggle }: { editor: Editor; toggle: ReactNode }) {
  const screens = useEditorValue(
    editor,
    (current) =>
      current
        .getChildren(current.state.currentPageId)
        .map((node) => ({
          id: node.id,
          name: node.name,
          width: node.width,
          height: node.height,
          type: node.type,
          visible: node.visible,
        })),
    (a, b) => a.length === b.length && a.every((screen, index) => shallowEqual(screen, b[index])),
  );
  const selectedIds = useEditorValue(editor, (current) => [...current.state.selectedIds], arraysEqual);
  const activeScreenId = selectedIds[0] ? (screenOf(editor, selectedIds[0])?.id ?? null) : null;
  // Screens the user opened or closed. The rest are open only while active.
  const [openById, setOpenById] = useState<Record<string, boolean>>({});

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-1 pl-3 pr-1.5">
        <span className="text-[11px] font-semibold text-foreground">Screens</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{screens.length}</span>
        <div className="ml-auto flex items-center">{toggle}</div>
      </div>
      <nav role="tree" aria-label="Screens and layers" className="min-h-0 flex-1 overflow-y-auto pb-2">
        {screens.length === 0 ? <p className="px-3 py-1 text-xs text-muted-foreground">No screens yet.</p> : null}
        {screens.map((screen) => {
          const isActive = activeScreenId === screen.id;
          const isOpen = openById[screen.id] ?? isActive;
          const Icon =
            screen.type !== "FRAME"
              ? (TYPE_ICONS[screen.type] ?? Square)
              : screen.width === SCREEN_SIZES.mobile.width
                ? Smartphone
                : Monitor;
          return (
            <div key={screen.id}>
              <div
                role="treeitem"
                aria-selected={isActive}
                aria-expanded={isOpen}
                data-tip={screen.name}
                data-tip-detail={`${Math.round(screen.width)} × ${Math.round(screen.height)}. Click to go to it, double-click to rename.`}
                onClick={() => {
                  editor.select([screen.id]);
                  editor.zoomToSelection();
                }}
                className={cn(
                  "group flex h-7 w-full cursor-default items-center gap-1.5 pr-2 text-xs font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  selectedIds.includes(screen.id) && "bg-primary/15",
                  !screen.visible && "opacity-50",
                )}
                style={{ paddingLeft: indent(0) }}
              >
                <button
                  type="button"
                  aria-label={isOpen ? `Hide layers of ${screen.name}` : `Show layers of ${screen.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenById((current) => ({ ...current, [screen.id]: !isOpen }));
                  }}
                  className="-ml-0.5 rounded p-0.5 hover:bg-foreground/10"
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
                </button>
                <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive && "text-primary")} />
                <InlineName name={screen.name} onRename={(name) => editor.renameNode(screen.id, name)} />
                <VisibilityButton
                  isVisible={screen.visible}
                  name="screen"
                  onToggle={() => editor.toggleNodeVisibility(screen.id)}
                />
              </div>
              {isOpen ? <ScreenLayers editor={editor} screenId={screen.id} selectedIds={selectedIds} /> : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}

/** A screen's children, topmost first, the way Figma lists layers. */
function ScreenLayers({ editor, screenId, selectedIds }: { editor: Editor; screenId: string; selectedIds: string[] }) {
  const childIds = useEditorValue(editor, (current) => current.getNode(screenId)?.childIds ?? [], arraysEqual, [screenId]);
  if (childIds.length === 0) {
    return (
      <p className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: indent(1) + 20 }}>
        No layers yet
      </p>
    );
  }
  return (
    <div role="group">
      {childIds
        .slice()
        .reverse()
        .map((childId) => (
          <LayerRow key={childId} editor={editor} id={childId} depth={1} selectedIds={selectedIds} />
        ))}
    </div>
  );
}

function LayerRow({
  editor,
  id,
  depth,
  selectedIds,
}: {
  editor: Editor;
  id: string;
  depth: number;
  selectedIds: string[];
}) {
  const node = useEditorValue(
    editor,
    (current) => {
      const found = current.getNode(id);
      return found
        ? { name: found.name, visible: found.visible, width: found.width, height: found.height, childIds: found.childIds, node: found }
        : null;
    },
    (a, b) =>
      !!a &&
      !!b &&
      a.name === b.name &&
      a.visible === b.visible &&
      a.width === b.width &&
      a.height === b.height &&
      arraysEqual(a.childIds, b.childIds),
    [id],
  );
  // Selecting a layer inside a screen opens its parents.
  const isOnSelectedPath = selectedIds.some((selectedId) => {
    for (let current = editor.getNode(selectedId); current; current = current.parentId ? editor.getNode(current.parentId) : undefined) {
      if (current.parentId === id) return true;
    }
    return false;
  });
  const [isOpen, setIsOpen] = useState(false);
  if (!node) return null;
  const hasChildren = node.childIds.length > 0;
  const isExpanded = isOpen || isOnSelectedPath;
  const isSelected = selectedIds.includes(id);

  return (
    <>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        data-tip={node.name}
        data-tip-detail={`${typeName(node.node.type)}, ${Math.round(node.width)} × ${Math.round(node.height)}. Shift-click to add to the selection.`}
        className={cn(
          "group flex h-7 cursor-default items-center gap-1.5 pr-2 text-xs",
          isSelected ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
          !node.visible && "opacity-50",
        )}
        style={{ paddingLeft: indent(depth) }}
        onClick={(event) => editor.select([id], event.shiftKey)}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="-ml-0.5 rounded p-0.5 hover:bg-foreground/10"
            onClick={(event) => {
              event.stopPropagation();
              setIsOpen(!isExpanded);
            }}
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <NodeIcon node={node.node} className={cn("h-3.5 w-3.5 shrink-0", isSelected && "text-primary")} />
        <InlineName name={node.name} onRename={(name) => editor.renameNode(id, name)} />
        <VisibilityButton isVisible={node.visible} name="layer" onToggle={() => editor.toggleNodeVisibility(id)} />
      </div>
      {isExpanded
        ? node.childIds
            .slice()
            .reverse()
            .map((childId) => <LayerRow key={childId} editor={editor} id={childId} depth={depth + 1} selectedIds={selectedIds} />)
        : null}
    </>
  );
}

/** Hides or shows a screen or layer. Always shown while hidden, so the way back is visible. */
function VisibilityButton({ isVisible, name, onToggle }: { isVisible: boolean; name: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={`${isVisible ? "Hide" : "Show"} ${name}`}
      className={cn("rounded p-0.5 hover:bg-foreground/10", isVisible ? "invisible group-hover:visible" : "visible")}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
    </button>
  );
}

/** A name that turns into a text field on double-click, like Figma's layer names. */
function InlineName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setDraft(name)}>
        {name}
      </span>
    );
  }
  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    setDraft(null);
  };
  return (
    <input
      autoFocus
      value={draft}
      aria-label="Layer name"
      className="min-w-0 flex-1 rounded border border-primary bg-background px-1 text-xs outline-none"
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(null);
      }}
    />
  );
}

const arraysEqual = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);
