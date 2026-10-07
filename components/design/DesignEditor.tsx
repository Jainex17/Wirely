"use client";

import { createDefaultEditorState, createEditor, type Editor, EDITOR_TOOLS, type Tool, TOOL_SHORTCUTS } from "@open-pencil/core/editor";
import { EDITOR_COMMAND_METADATA } from "@open-pencil/vue";
import { ArrowLeft, ChevronUp, Circle, Columns3, Contrast, Frame, Hand, LayoutGrid, Maximize, Minus, MousePointer2, PenTool, Plus, Scan, Square, Type } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { reactive } from "vue";
import { toast } from "@/components/ui/sonner";
import { type DesignCommands, mountDesignCanvas } from "@/components/design/designCanvas";
import { bindDesignClipboard } from "@/components/design/clipboard";
import { bindDrawIntoScreens } from "@/components/design/drawIntoScreens";
import { fetchDesignDocument, startDocumentSync, startSelectionReporting } from "@/components/design/documentSync";
import { findCommandForKey, isTypingTarget } from "@/components/design/keyboard";
import DesignSidebar from "@/components/design/DesignSidebar";
import GeneratePanel, { type ChatMessage, type GenerateModel } from "@/components/design/GeneratePanel";
import PropertiesPanel from "@/components/design/PropertiesPanel";
import { useEditorValue } from "@/components/design/useEditorValue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { arrangePagePositions, type PageArrangement } from "@/lib/canvasScene";
import { screensPage } from "@/lib/design/document";
import { cn } from "@/lib/utils";
import { CANVAS_BACKGROUND_COLORS, type CanvasBackground, useEditorStore } from "@/store/useEditorStore";

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
// Wirely's screens use most; the rest stay on their shortcuts.
const TOOLBAR_TOOLS: Tool[] = ["SELECT", "FRAME", "RECTANGLE", "ELLIPSE", "LINE", "TEXT", "PEN", "HAND"];

const toolLabel = (tool: Tool) => {
  const definition = EDITOR_TOOLS.find((entry) => entry.key === tool || entry.flyout?.includes(tool));
  const shortcut = Object.entries(TOOL_SHORTCUTS).find(([, value]) => value === tool)?.[0]?.replace("Key", "");
  const name = definition?.key === tool ? definition.label : tool.charAt(0) + tool.slice(1).toLowerCase();
  return shortcut ? `${name} (${shortcut})` : name;
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

interface DesignEditorProps {
  projectId: string;
  projectTitle: string;
  /** The switch to the project's HTML tab. */
  viewTabs: ReactNode;
  /** Models in-app generation can run on the user's keys. */
  models: GenerateModel[];
  initialMessages: ChatMessage[];
}

/**
 * A project's Design tab: a Figma-like canvas of screens built from design
 * nodes, with layers on the left and properties on the right. The
 * document loads once, then saves as the user edits and reloads when an agent
 * changes it (see documentSync.ts).
 */
export default function DesignEditor({ projectId, projectTitle, viewTabs, models, initialMessages }: DesignEditorProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [commands, setCommands] = useState<DesignCommands | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [loadError, setLoadError] = useState<string | null>(null);

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
        const stopSync = startDocumentSync(projectId, created, version, {
          onStatus: setSaveStatus,
          onConflict: ({ keepMine, loadTheirs }) => {
            conflictToast = toast("An agent changed this design while you were editing.", {
              duration: Number.POSITIVE_INFINITY,
              action: { label: "Keep my edits", onClick: keepMine },
              cancel: { label: "Load theirs", onClick: loadTheirs },
            });
          },
        });
        const stopClipboard = bindDesignClipboard(created);
        const stopDrawIntoScreens = bindDrawIntoScreens(created);
        const stopSelection = startSelectionReporting(projectId, created);
        setEditor(created);
        teardown = () => {
          if (conflictToast !== null) toast.dismiss(conflictToast);
          stopClipboard();
          stopDrawIntoScreens();
          stopSelection();
          stopSync();
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

  // The engine paints its own canvas, so it gets the chosen background too.
  const canvasBackground = useEditorStore((state) => state.canvasBackground);
  useEffect(() => {
    const container = canvasRef.current;
    if (editor && container) editor.setPageColor(cssColorOf(container));
  }, [editor, canvasBackground]);

  return (
    <div className="editor-theme flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {editor ? <DesignSidebar editor={editor} projectTitle={projectTitle} /> : <SidebarPlaceholder title={projectTitle} />}
      <main
        className="relative min-w-0 flex-1 bg-background"
        style={canvasBackground === "dark" ? undefined : { backgroundColor: CANVAS_BACKGROUND_COLORS[canvasBackground] }}
      >
        <div ref={canvasRef} className="absolute inset-0" />
        <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2">{viewTabs}</div>
        {loadError ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{loadError}</div>
        ) : null}
        {editor ? (
          <>
            <TopBar editor={editor} saveStatus={saveStatus} />
            <Toolbar editor={editor} />
            <EmptyHint editor={editor} />
          </>
        ) : null}
      </main>
      <RightPanel
        design={editor ? <PropertiesPanel editor={editor} /> : null}
        generate={<GeneratePanel projectId={projectId} models={models} initialMessages={initialMessages} />}
      />
    </div>
  );
}

/**
 * The right panel: the selected layer's properties, or generation. Generate
 * stays mounted while hidden, so a run keeps streaming when the user switches
 * to Design to look at a screen.
 */
function RightPanel({ design, generate }: { design: ReactNode; generate: ReactNode }) {
  const [tab, setTab] = useState<"design" | "generate">("design");
  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 text-sm">
        {(["design", "generate"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={cn(
              "rounded-md px-2.5 py-1 capitalize",
              tab === name ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div className={cn("min-h-0 flex-1 flex-col", tab === "design" ? "flex" : "hidden")}>{design}</div>
      <div className={cn("min-h-0 flex-1 flex-col", tab === "generate" ? "flex" : "hidden")}>{generate}</div>
    </aside>
  );
}

function SidebarPlaceholder({ title }: { title: string }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <Link href="/" aria-label="Back to projects" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="truncate text-sm font-medium">{title}</span>
      </div>
    </aside>
  );
}

function TopBar({ editor, saveStatus }: { editor: Editor; saveStatus: SaveStatus }) {
  const zoom = useEditorValue(editor, (current) => current.state.zoom);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-end gap-2 px-3">
      <span className="pointer-events-auto self-center rounded-md bg-sidebar/90 px-2 py-1 text-xs text-muted-foreground">
        {SAVE_LABELS[saveStatus]}
      </span>
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-sidebar p-0.5 text-xs">
        <IconButton label="Zoom out" onClick={() => editor.zoomToLevel(editor.state.zoom / 1.25)}>
          <Minus className="h-3.5 w-3.5" />
        </IconButton>
        <button
          type="button"
          className="min-w-12 rounded px-1.5 py-1 tabular-nums hover:bg-accent"
          title="Zoom to fit (Shift+1)"
          onClick={() => editor.zoomToFit()}
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => editor.zoomToLevel(editor.state.zoom * 1.25)}>
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const activeTool = useEditorValue(editor, (current) => current.state.activeTool);
  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-sidebar p-1 shadow-xl">
      {TOOLBAR_TOOLS.map((tool) => (
        <IconButton key={tool} label={toolLabel(tool)} isActive={activeTool === tool} onClick={() => editor.setTool(tool)}>
          {TOOL_ICONS[tool]}
        </IconButton>
      ))}
      <div className="mx-1 h-5 w-px bg-border" />
      <ArrangeMenu editor={editor} />
      <BackgroundMenu />
    </div>
  );
}

const menuTriggerClass =
  "flex h-8 items-center gap-0.5 rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground";

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
      <DropdownMenuTrigger className={menuTriggerClass} aria-label="Arrange and zoom" title="Arrange and zoom">
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
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasSelection} onSelect={() => editor.zoomToSelection()}>
          <Scan className="h-4 w-4" />
          Fit selection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const BACKGROUND_LABELS: Record<CanvasBackground, string> = { dark: "Dark", gray: "Gray", light: "Light" };

/** Picks the canvas background. The choice is shared with the HTML canvas and kept in local storage. */
function BackgroundMenu() {
  const canvasBackground = useEditorStore((state) => state.canvasBackground);
  const setCanvasBackground = useEditorStore((state) => state.setCanvasBackground);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={menuTriggerClass}
        aria-label={`Canvas background: ${BACKGROUND_LABELS[canvasBackground]}`}
        title="Canvas background"
      >
        <Contrast className="h-4 w-4" />
        <ChevronUp className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" sideOffset={8} className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Canvas background</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={canvasBackground} onValueChange={(value) => setCanvasBackground(value as CanvasBackground)}>
          {(Object.keys(BACKGROUND_LABELS) as CanvasBackground[]).map((background) => (
            <DropdownMenuRadioItem key={background} value={background}>
              {BACKGROUND_LABELS[background]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
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

export function IconButton({
  label,
  isActive = false,
  onClick,
  children,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        isActive ? "bg-sky-600 text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The background color of the canvas area, which the theme or the background menu sets, as an engine color. */
const cssColorOf = (element: HTMLElement) => {
  const [r = 0, g = 0, b = 0] = (getComputedStyle(element.parentElement ?? element).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
};
