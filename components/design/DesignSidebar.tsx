"use client";

import type { Editor } from "@open-pencil/core/editor";
import type { SceneNode } from "@open-pencil/scene-graph";
import {
  ChevronDown,
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
import { shallowEqual, useEditorValue } from "@/components/design/useEditorValue";
import { SCREEN_SIZES } from "@/lib/design/document";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Partial<Record<SceneNode["type"], ReactNode>> = {
  FRAME: <Frame className="h-3.5 w-3.5" />,
  SECTION: <Frame className="h-3.5 w-3.5" />,
  GROUP: <Frame className="h-3.5 w-3.5" />,
  TEXT: <Type className="h-3.5 w-3.5" />,
  RECTANGLE: <Square className="h-3.5 w-3.5" />,
  ELLIPSE: <Circle className="h-3.5 w-3.5" />,
  LINE: <Minus className="h-3.5 w-3.5" />,
  VECTOR: <PenTool className="h-3.5 w-3.5" />,
  COMPONENT: <Component className="h-3.5 w-3.5" />,
  INSTANCE: <Component className="h-3.5 w-3.5" />,
};

const nodeIcon = (node: SceneNode) =>
  node.fills.some((fill) => fill.type === "IMAGE") ? <ImageIcon className="h-3.5 w-3.5" /> : (TYPE_ICONS[node.type] ?? <Square className="h-3.5 w-3.5" />);

/** The top-level frame holding `id`, which is the screen it belongs to. */
const screenOf = (editor: Editor, id: string) => {
  let node = editor.getNode(id);
  while (node?.parentId && editor.getNode(node.parentId)?.type !== "CANVAS") node = editor.getNode(node.parentId);
  return node ?? null;
};

/**
 * The left panel: the project's screens, then the layers of the screen the
 * selection is in, the way Figma lists frames and their layers.
 */
export default function DesignSidebar({ editor }: { editor: Editor }) {
  const screens = useEditorValue(
    editor,
    (current) =>
      current
        .getChildren(current.state.currentPageId)
        .map((node) => ({ id: node.id, name: node.name, width: node.width, type: node.type })),
    (a, b) => a.length === b.length && a.every((screen, index) => shallowEqual(screen, b[index])),
  );
  const selectedIds = useEditorValue(editor, (current) => [...current.state.selectedIds], arraysEqual);
  const activeScreenId = selectedIds[0] ? (screenOf(editor, selectedIds[0])?.id ?? null) : null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sm">
      <section className="shrink-0 border-b border-border py-2">
        <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Screens</h2>
        {screens.length === 0 ? <p className="px-3 py-1 text-xs text-muted-foreground">No screens yet.</p> : null}
        <ul className="max-h-56 overflow-y-auto">
          {screens.map((screen) => (
            <li key={screen.id}>
              <RenamableRow
                name={screen.name}
                icon={
                  screen.type !== "FRAME" ? (
                    (TYPE_ICONS[screen.type] ?? <Square className="h-3.5 w-3.5" />)
                  ) : screen.width === SCREEN_SIZES.mobile.width ? (
                    <Smartphone className="h-3.5 w-3.5" />
                  ) : (
                    <Monitor className="h-3.5 w-3.5" />
                  )
                }
                isSelected={activeScreenId === screen.id}
                onSelect={() => {
                  editor.select([screen.id]);
                  editor.zoomToSelection();
                }}
                onRename={(name) => editor.renameNode(screen.id, name)}
              />
            </li>
          ))}
        </ul>
      </section>
      <section className="min-h-0 flex-1 overflow-y-auto py-2">
        <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Layers</h2>
        {activeScreenId ? (
          <LayerRow editor={editor} id={activeScreenId} depth={0} selectedIds={selectedIds} />
        ) : (
          <p className="px-3 py-1 text-xs text-muted-foreground">Select a screen to see its layers.</p>
        )}
      </section>
    </aside>
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
      return found ? { name: found.name, visible: found.visible, childIds: found.childIds, node: found } : null;
    },
    (a, b) => !!a && !!b && a.name === b.name && a.visible === b.visible && arraysEqual(a.childIds, b.childIds),
    [id],
  );
  // Selecting a layer inside a screen opens its parents.
  const isOnSelectedPath = selectedIds.some((selectedId) => {
    for (let current = editor.getNode(selectedId); current; current = current.parentId ? editor.getNode(current.parentId) : undefined) {
      if (current.parentId === id) return true;
    }
    return false;
  });
  const [isOpen, setIsOpen] = useState(depth === 0);
  if (!node) return null;
  const hasChildren = node.childIds.length > 0;
  const isExpanded = isOpen || isOnSelectedPath;

  return (
    <>
      <div
        className={cn(
          "group flex h-7 cursor-default items-center gap-1 pr-2",
          selectedIds.includes(id) ? "bg-sky-600/30 text-foreground" : "hover:bg-accent",
          !node.visible && "opacity-50",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={(event) => editor.select([id], event.shiftKey)}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse" : "Expand"}
          className={cn("flex h-4 w-4 items-center justify-center text-muted-foreground", !hasChildren && "invisible")}
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(!isExpanded);
          }}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <span className="text-muted-foreground">{nodeIcon(node.node)}</span>
        <InlineName name={node.name} onRename={(name) => editor.renameNode(id, name)} />
        <button
          type="button"
          aria-label={node.visible ? "Hide layer" : "Show layer"}
          className="ml-auto hidden text-muted-foreground hover:text-foreground group-hover:block"
          onClick={(event) => {
            event.stopPropagation();
            editor.toggleNodeVisibility(id);
          }}
        >
          {node.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
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

function RenamableRow({
  name,
  icon,
  isSelected,
  onSelect,
  onRename,
}: {
  name: string;
  icon: ReactNode;
  isSelected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
}) {
  return (
    <div
      className={cn("flex h-7 cursor-default items-center gap-2 px-3", isSelected ? "bg-sky-600/30" : "hover:bg-accent")}
      onClick={onSelect}
    >
      <span className="text-muted-foreground">{icon}</span>
      <InlineName name={name} onRename={onRename} />
    </div>
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
      className="min-w-0 flex-1 rounded border border-sky-600 bg-background px-1 text-sm outline-none"
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
