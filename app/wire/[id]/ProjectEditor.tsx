"use client";

import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import DesignEditor from "@/components/design/DesignEditorLoader";
import HoverTips from "@/components/HoverTips";
import { CANVAS_VIEWS, ProjectChromeContext } from "@/components/ProjectChrome";
import { cn } from "@/lib/utils";
import { type CanvasView as EditorView, useEditorStore } from "@/store/useEditorStore";
import WireEditor from "./WireEditor";

interface ProjectEditorProps {
  initialView: EditorView;
  projectTitle: string;
  wire: ComponentProps<typeof WireEditor>;
  design: ComponentProps<typeof DesignEditor>;
}

/**
 * One project, two canvases: HTML pages on Pages, design screens on Editor.
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
    // still reloads on Pages when that is what the user picked.
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }, []);
  // Alt plus the tab's number switches to it. Neither canvas binds Alt+digit,
  // and matching on `code` keeps it working where Alt+1 types a character.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const next = CANVAS_VIEWS.find((option) => option.code === event.code);
      if (!next) return;
      event.preventDefault();
      changeView(next.view);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeView]);
  // The panels in both editors read the title, the tab, and the switch from here.
  const chrome = useMemo(
    () => ({ projectId: wire.wireId, projectTitle, view, onViewChange: changeView }),
    [wire.wireId, projectTitle, view, changeView],
  );
  const tabPanel = (option: EditorView, editor: ReactNode) =>
    opened.has(option) ? (
      <div inert={view !== option} className={cn("absolute inset-0", view !== option && "invisible")}>
        {editor}
      </div>
    ) : null;
  return (
    <ProjectChromeContext value={chrome}>
      <div className="relative h-dvh w-full overflow-hidden bg-background">
        {tabPanel("html", <WireEditor {...wire} />)}
        {tabPanel("design", <DesignEditor {...design} />)}
        <HoverTips />
      </div>
    </ProjectChromeContext>
  );
}
