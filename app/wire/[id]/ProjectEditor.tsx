"use client";

import { ArrowLeft, LayoutTemplate, PencilRuler } from "lucide-react";
import Link from "next/link";
import { type ComponentProps, type ReactNode, useCallback, useEffect, useState } from "react";
import DesignEditor from "@/components/design/DesignEditorLoader";
import HoverTips from "@/components/HoverTips";
import { cn } from "@/lib/utils";
import { type CanvasView as EditorView, useEditorStore } from "@/store/useEditorStore";
import WireEditor from "./WireEditor";

// Alt plus the tab's number switches to it. Neither canvas binds Alt+digit,
// and matching on `code` keeps it working where Alt+1 types a character.
const VIEWS: Array<{ view: EditorView; label: string; detail: string; code: string; Icon: typeof LayoutTemplate }> = [
  {
    view: "html",
    label: "Prototype",
    detail: "HTML pages your agent writes. Click through them as a prototype.",
    code: "Digit1",
    Icon: LayoutTemplate,
  },
  {
    view: "design",
    label: "Editor",
    detail: "Screens made of layers you edit by hand, like Figma frames.",
    code: "Digit2",
    Icon: PencilRuler,
  },
];

/**
 * The one row across the top of the project: the way home, the project title,
 * and a tab for each canvas, sized to its label. It sits outside both editors,
 * so it stays up while the design module loads and when it fails to.
 */
function TopBar({
  projectTitle,
  view,
  onChange,
}: {
  projectTitle: string;
  view: EditorView;
  onChange: (view: EditorView) => void;
}) {
  return (
    <header className="editor-theme flex h-9 shrink-0 items-center border-b border-sidebar-border bg-sidebar text-xs">
      <Link
        href="/"
        aria-label="Back to projects"
        className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </Link>
      <h1 className="max-w-60 truncate pr-3 font-medium text-foreground">{projectTitle}</h1>
      <div role="tablist" aria-label="Canvas" className="flex h-full border-l border-sidebar-border">
        {VIEWS.map(({ view: option, label, detail, code, Icon }) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            data-tip={`${label} (Alt+${code.slice(-1)})`}
            data-tip-detail={detail}
            onClick={() => onChange(option)}
            className={cn(
              "flex items-center gap-1.5 border-r border-sidebar-border px-3 font-medium transition-colors",
              view === option
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}

interface ProjectEditorProps {
  initialView: EditorView;
  projectTitle: string;
  wire: ComponentProps<typeof WireEditor>;
  design: ComponentProps<typeof DesignEditor>;
}

/**
 * One project, two canvases: HTML pages on Prototype, design screens on Editor.
 * Each tab mounts the first time it is opened and then stays mounted, hidden
 * while the other is on screen, so switching back is instant: the canvas,
 * sidebars, and chat are as the user left them, with no reload. The hidden tab
 * keeps its size, so neither canvas sees a resize. The tab is kept in the URL,
 * so a reload or a shared link opens the same one.
 */
export default function ProjectEditor({ initialView, projectTitle, wire, design }: ProjectEditorProps) {
  const [view, setView] = useState(initialView);
  const [opened, setOpened] = useState(() => new Set([initialView]));
  useEffect(() => {
    useEditorStore.getState().setCanvasView(view);
  }, [view]);
  const changeView = useCallback((next: EditorView) => {
    setView(next);
    setOpened((current) => (current.has(next) ? current : new Set(current).add(next)));
    // Both tabs are written explicitly, so a project that defaults to Editor
    // still reloads on Prototype when that is what the user picked.
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }, []);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const next = VIEWS.find((option) => option.code === event.code);
      if (!next) return;
      event.preventDefault();
      changeView(next.view);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeView]);
  const tabPanel = (option: EditorView, editor: ReactNode) =>
    opened.has(option) ? (
      <div inert={view !== option} className={cn("absolute inset-0", view !== option && "invisible")}>
        {editor}
      </div>
    ) : null;
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <TopBar projectTitle={projectTitle} view={view} onChange={changeView} />
      <div className="relative min-h-0 flex-1">
        {tabPanel("html", <WireEditor {...wire} />)}
        {tabPanel("design", <DesignEditor {...design} />)}
      </div>
      <HoverTips />
    </div>
  );
}
