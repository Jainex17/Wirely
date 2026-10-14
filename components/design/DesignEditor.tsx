"use client";

import { createDefaultEditorState, createEditor, type Editor, EDITOR_TOOLS, type Tool, TOOL_SHORTCUTS } from "@open-pencil/core/editor";
import { EDITOR_COMMAND_METADATA } from "@open-pencil/vue";
import { ChevronUp, Circle, Columns3, Frame, Hand, History, LayoutGrid, Maximize, Minus, MousePointer2, PenTool, Scan, Square, Type } from "lucide-react";
import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { reactive } from "vue";
import { toast } from "@/components/ui/sonner";
import { type DesignCommands, mountDesignCanvas } from "@/components/design/designCanvas";
import { bindDesignClipboard } from "@/components/design/clipboard";
import { bindDrawIntoScreens } from "@/components/design/drawIntoScreens";
import { fetchDesignDocument, startDocumentSync, startSelectionReporting } from "@/components/design/documentSync";
import { findCommandForKey, isTypingTarget } from "@/components/design/keyboard";
import ChatPanel, { type ChatMessage, type ChatModel } from "@/components/design/ChatPanel";
import DesignSidebar from "@/components/design/DesignSidebar";
import DocumentHistoryDialog from "@/components/design/DocumentHistoryDialog";
import PropertiesPanel from "@/components/design/PropertiesPanel";
import { useEditorValue } from "@/components/design/useEditorValue";
import {
  CanvasBackgroundMenu,
  menuTriggerClass,
  PanelToggle,
  SidePanelTabs,
  ToolbarDivider,
  ToolButton,
  toolbarClass,
  ZoomControls,
} from "@/components/EditorChrome";
import { FloatingProjectActions, ProjectActionsBar } from "@/components/ProjectChrome";
import type { UserAccountMenuUser } from "@/components/UserAccountMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ASSET_DRAG_TYPE, parseAssetDrag } from "@/lib/assetDrag";
import { assetPath } from "@/lib/assetPaths";
import { arrangePagePositions, type PageArrangement } from "@/lib/canvasScene";
import { screensPage } from "@/lib/design/document";
import { CANVAS_BACKGROUND_COLORS, useEditorStore } from "@/store/useEditorStore";

type SaveStatus = "saved" | "saving" | "unsaved" | "offline";

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  offline: "Offline, retrying",
};

const TOOL_ICONS: Partial<Record<Tool, ReactNode>> = {
  SELECT: <MousePointer2 className="h-4 w-4" />,
  FRAME: <Frame className="h-4 w-4" />,
  RECTANGLE: <Square className="h-4 w-4" />,
  ELLIPSE: <Circle className="h-4 w-4" />,
  LINE: <Minus className="h-4 w-4" />,
  PEN: <PenTool className="h-4 w-4" />,
  TEXT: <Type className="h-4 w-4" />,
  HAND: <Hand className="h-4 w-4" />,
};

// The bar shows each top-level tool plus the shapes from the rectangle flyout
// Wirely's screens use most; the rest stay on their shortcuts. Pointing tools
// come first and drawing tools after the divider, in the Pages bar's order.
const POINTING_TOOLS: Tool[] = ["SELECT", "HAND", "PEN"];
const DRAWING_TOOLS: Tool[] = ["FRAME", "RECTANGLE", "ELLIPSE", "LINE", "TEXT"];

const TOOL_DETAILS: Partial<Record<Tool, string>> = {
  SELECT: "Select layers and drag them around",
  FRAME: "Drag to draw a screen or a frame inside one",
  RECTANGLE: "Drag to draw a box",
  ELLIPSE: "Drag to draw a circle or oval",
  LINE: "Drag to draw a line",
  TEXT: "Click to add text",
  PEN: "Click points to draw a vector path",
  HAND: "Pan the canvas. Hold Space for the same.",
};

const RIGHT_TABS = [
  { id: "chat", label: "Chat", detail: "Ask a model on your key to design or change screens" },
  { id: "design", label: "Design", detail: "Edit the selected layer's size, fills, and layout" },
] as const;

const toolLabel = (tool: Tool) => {
  const definition = EDITOR_TOOLS.find((entry) => entry.key === tool || entry.flyout?.includes(tool));
  const shortcut = Object.entries(TOOL_SHORTCUTS).find(([, value]) => value === tool)?.[0]?.replace("Key", "");
  const name = definition?.key === tool ? definition.label : tool.charAt(0) + tool.slice(1).toLowerCase();
  return shortcut ? `${name} (${shortcut})` : name;
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

interface DesignEditorProps {
  projectId: string;
  sessionUser: UserAccountMenuUser;
  /** Models in-app generation can run on the user's keys. */
  models: ChatModel[];
  initialMessages: ChatMessage[];
}

/**
 * A project's Editor tab: a Figma-like canvas of screens built from design
 * nodes, laid out like the Pages tab, with screens and layers on the left
 * and chat and properties on the right. The document loads once, then saves
 * as the user edits and reloads when an agent changes it (see documentSync.ts).
 */
export default function DesignEditor({ projectId, sessionUser, models, initialMessages }: DesignEditorProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [commands, setCommands] = useState<DesignCommands | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<"chat" | "design">("chat");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // The open document's sync, for loading a restored version at once.
  const refreshDocumentRef = useRef<(() => void) | null>(null);

  // Dialogs, menus, and toasts portal to <body>, so the editor palette goes
  // there too, as the HTML tab does.
  useEffect(() => {
    document.body.classList.add("editor-theme");
    return () => document.body.classList.remove("editor-theme");
  }, []);


  // Load, create the editor, mount the canvas, and sync, as one lifetime, so
  // a remount (React's development double run included) starts clean.
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    let cancelled = false;
    let teardown: (() => void) | null = null;

    void fetchDesignDocument(projectId)
      .then(({ graph, version }) => {
        if (cancelled) return;
        const created = createEditor({
          graph,
          state: reactive(createDefaultEditorState(screensPage(graph).id)),
          getViewportSize: () => ({ width: container.clientWidth, height: container.clientHeight }),
        });
        const unmount = mountDesignCanvas(container, created, (ready) => {
          setCommands(ready);
          // Frame every screen once the canvas has its size.
          requestAnimationFrame(() => created.zoomToFit());
        });
        // The conflict choice acts on this editor, so it goes away with it.
        let conflictToast: string | number | null = null;
        const sync = startDocumentSync(projectId, created, version, {
          onStatus: setSaveStatus,
          onConflict: ({ keepMine, loadTheirs }) => {
            conflictToast = toast("An agent or a restore changed this design while you were editing.", {
              duration: Number.POSITIVE_INFINITY,
              action: { label: "Keep my edits", onClick: keepMine },
              cancel: { label: "Load theirs", onClick: loadTheirs },
            });
          },
        });
        const stopClipboard = bindDesignClipboard(created);
        const stopDrawIntoScreens = bindDrawIntoScreens(created);
        const stopSelection = startSelectionReporting(projectId, created);
        refreshDocumentRef.current = sync.refresh;
        setEditor(created);
        teardown = () => {
          if (conflictToast !== null) toast.dismiss(conflictToast);
          refreshDocumentRef.current = null;
          stopClipboard();
          stopDrawIntoScreens();
          stopSelection();
          sync.stop();
          unmount();
          created.dispose();
        };
      })
      .catch(() => {
        if (!cancelled) setLoadError("This project's design could not be loaded. Refresh to try again.");
      });

    return () => {
      cancelled = true;
      teardown?.();
      setEditor(null);
      setCommands(null);
    };
  }, [projectId]);

  useEffect(() => {
    if (!editor || !commands) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || editor.state.editingTextId) return;
      if (useEditorStore.getState().canvasView !== "design") return;
      const commandId = findCommandForKey(EDITOR_COMMAND_METADATA, event, IS_MAC);
      if (commandId) {
        const command = commands.commands[commandId];
        if (command.enabled.value) command.run();
        event.preventDefault();
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && editor.state.selectedIds.size > 0) {
        editor.deleteSelected();
        event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        editor.clearSelection();
        editor.setTool("SELECT");
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const tool = TOOL_SHORTCUTS[event.code as keyof typeof TOOL_SHORTCUTS];
      if (tool) {
        editor.setTool(tool);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commands, editor]);

  // Selecting a layer opens its properties, as picking an element does on the
  // Pages tab.
  useEffect(() => {
    if (!editor) return;
    return editor.onEditorEvent("selection:changed", (ids) => {
      if (ids.length > 0) setRightTab("design");
    });
  }, [editor]);

  // The engine paints its own canvas, so it gets the chosen background too.
  const canvasBackground = useEditorStore((state) => state.canvasBackground);
  useEffect(() => {
    const container = canvasRef.current;
    if (editor && container) editor.setPageColor(cssColorOf(container));
  }, [editor, canvasBackground]);

  // A project image dragged from the assets folder lands where it is dropped,
  // the way a pasted image does.
  const handleAssetDrop = (event: DragEvent) => {
    const asset = parseAssetDrag(event.dataTransfer.getData(ASSET_DRAG_TYPE));
    const container = canvasRef.current;
    if (!asset || !editor || !container) return;
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const { panX, panY, zoom } = editor.state;
    const x = (event.clientX - rect.left - panX) / zoom;
    const y = (event.clientY - rect.top - panY) / zoom;
    void fetch(assetPath(asset.id))
      .then((response) => {
        if (!response.ok) throw new Error(`Asset fetch failed with status ${response.status}`);
        return response.blob();
      })
      .then((blob) => editor.placeImageFiles([new File([blob], asset.name, { type: blob.type })], x, y))
      .catch(() => toast.error(`Could not add ${asset.name}.`));
  };

  const rightToggle = (
    <PanelToggle
      side="right"
      name="chat panel"
      isCollapsed={isRightCollapsed}
      onToggle={() => setIsRightCollapsed((collapsed) => !collapsed)}
    />
  );
  // The save state opens the design's history, as in Google Docs.
  const saveLabel = (
    <button
      type="button"
      onClick={() => setIsHistoryOpen(true)}
      data-tip="Version history"
      data-tip-detail="See and restore earlier states of this design"
      className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <History className="h-3.5 w-3.5" />
      <span role="status">{SAVE_LABELS[saveStatus]}</span>
    </button>
  );
  const sidebar = (isCollapsed: boolean) => (
    <DesignSidebar
      editor={editor}
      projectId={projectId}
      user={sessionUser}
      isCollapsed={isCollapsed}
      onToggle={() => setIsLeftCollapsed(!isCollapsed)}
    />
  );

  return (
    <div className="editor-theme flex h-full w-full overflow-hidden bg-background text-foreground">
      {isLeftCollapsed ? null : sidebar(false)}
      <main
        className="relative min-w-0 flex-1 bg-background"
        style={canvasBackground === "dark" ? undefined : { backgroundColor: CANVAS_BACKGROUND_COLORS[canvasBackground] }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) event.preventDefault();
        }}
        onDrop={handleAssetDrop}
      >
        <div ref={canvasRef} className="absolute inset-0" />
        {isLeftCollapsed ? sidebar(true) : null}
        {loadError ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{loadError}</div>
        ) : null}
        {editor ? (
          <>
            {isRightCollapsed ? (
              <FloatingProjectActions toggle={rightToggle} zoom={<DesignZoom editor={editor} />} status={saveLabel} />
            ) : null}
            <Toolbar editor={editor} />
            <EmptyHint editor={editor} />
          </>
        ) : null}
      </main>
      {/* Kept mounted while collapsed, so a chat run keeps streaming. */}
      <aside
        className={
          isRightCollapsed ? "hidden" : "flex w-72 shrink-0 flex-col overflow-hidden border-l border-sidebar-border bg-sidebar"
        }
      >
        <ProjectActionsBar toggle={rightToggle} status={saveLabel} />
        <SidePanelTabs
          tabs={RIGHT_TABS}
          active={rightTab}
          onChange={setRightTab}
          end={editor ? <DesignZoom editor={editor} /> : null}
        />
        <div className={rightTab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <ChatPanel projectId={projectId} models={models} initialMessages={initialMessages} />
        </div>
        <div className={rightTab === "design" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          {editor ? <PropertiesPanel editor={editor} /> : null}
        </div>
      </aside>
      <DocumentHistoryDialog
        projectId={projectId}
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        onRestored={() => refreshDocumentRef.current?.()}
      />
    </div>
  );
}

/** The zoom menu for the design canvas. The engine owns the zoom level. */
function DesignZoom({ editor }: { editor: Editor }) {
  const zoom = useEditorValue(editor, (current) => current.state.zoom);
  return (
    <ZoomControls
      zoom={zoom * 100}
      onZoomOut={() => editor.zoomToLevel(editor.state.zoom / 1.25)}
      onFit={() => editor.zoomToFit()}
      onZoomIn={() => editor.zoomToLevel(editor.state.zoom * 1.25)}
    />
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const activeTool = useEditorValue(editor, (current) => current.state.activeTool);
  const button = (tool: Tool) => (
    <ToolButton
      key={tool}
      label={toolLabel(tool)}
      detail={TOOL_DETAILS[tool]}
      isActive={activeTool === tool}
      onClick={() => editor.setTool(tool)}
    >
      {TOOL_ICONS[tool]}
    </ToolButton>
  );
  return (
    <div className={toolbarClass}>
      {POINTING_TOOLS.map(button)}
      <ToolbarDivider />
      {DRAWING_TOOLS.map(button)}
      <ToolbarDivider />
      <ArrangeMenu editor={editor} />
      <CanvasBackgroundMenu />
    </div>
  );
}

/** Lines the screens up in a row or a grid, as one undo step, the way the HTML canvas arranges pages. */
const arrangeScreens = (editor: Editor, arrangement: PageArrangement) => {
  const screens = editor.getChildren(editor.state.currentPageId);
  if (screens.length === 0) return;
  const positions = arrangePagePositions(screens, arrangement);
  const originals = new Map(screens.map((screen) => [screen.id, { x: screen.x, y: screen.y }]));
  for (const screen of screens) editor.graph.updateNode(screen.id, positions[screen.id]);
  editor.commitMove(originals);
  editor.zoomToFit();
};

function ArrangeMenu({ editor }: { editor: Editor }) {
  const hasSelection = useEditorValue(editor, (current) => current.state.selectedIds.size > 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={menuTriggerClass}
        aria-label="Arrange and zoom"
        data-tip-detail="Line screens up in a row or grid, or fit them in view"
      >
        <LayoutGrid className="h-4 w-4" />
        <ChevronUp className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Arrange screens</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => arrangeScreens(editor, "row")}>
          <Columns3 className="h-4 w-4" />
          In a row
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => arrangeScreens(editor, "grid")}>
          <LayoutGrid className="h-4 w-4" />
          In a grid
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Zoom</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => editor.zoomToFit()}>
          <Maximize className="h-4 w-4" />
          Fit all screens
          <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasSelection} onSelect={() => editor.zoomToSelection()}>
          <Scan className="h-4 w-4" />
          Fit selection
          <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Says how to start when the document has no screens. */
function EmptyHint({ editor }: { editor: Editor }) {
  const isEmpty = useEditorValue(editor, (current) => current.getChildren(current.state.currentPageId).length === 0);
  if (!isEmpty) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        No screens yet. Draw a frame with the Frame tool, or ask your agent to design one or to make an HTML page editable.
      </p>
    </div>
  );
}

/** The background color of the canvas area, which the theme or the background menu sets, as an engine color. */
const cssColorOf = (element: HTMLElement) => {
  const [r = 0, g = 0, b = 0] = (getComputedStyle(element.parentElement ?? element).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
};
