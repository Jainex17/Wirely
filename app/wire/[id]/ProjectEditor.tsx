"use client";

import { ArrowLeft, FileCode2, PencilRuler } from "lucide-react";
import Link from "next/link";
import { type ComponentProps, useState } from "react";
import DesignEditor from "@/components/design/DesignEditorLoader";
import { cn } from "@/lib/utils";
import WireEditor from "./WireEditor";

export type EditorView = "html" | "design";

const VIEWS: Array<{ view: EditorView; label: string; Icon: typeof FileCode2 }> = [
  { view: "html", label: "HTML", Icon: FileCode2 },
  { view: "design", label: "Design", Icon: PencilRuler },
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
        title="Back to projects"
        className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </Link>
      <h1 className="max-w-60 truncate pr-3 font-medium text-foreground">{projectTitle}</h1>
      <div role="tablist" aria-label="Canvas" className="flex h-full border-l border-sidebar-border">
        {VIEWS.map(({ view: option, label, Icon }) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
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
 * One project, two canvases: HTML pages on one tab, design screens on the
 * other. Only the open tab is mounted. Both keep their state on the server and
 * in the editor store, so switching back finds the canvas as it was left. The
 * tab is kept in the URL, so a reload or a shared link opens the same one.
 */
export default function ProjectEditor({ initialView, projectTitle, wire, design }: ProjectEditorProps) {
  const [view, setView] = useState(initialView);
  const changeView = (next: EditorView) => {
    setView(next);
    // Both tabs are written explicitly, so a project that defaults to Design
    // still reloads on HTML when that is what the user picked.
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  };
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <TopBar projectTitle={projectTitle} view={view} onChange={changeView} />
      <div className="min-h-0 flex-1">
        {view === "design" ? <DesignEditor {...design} /> : <WireEditor {...wire} />}
      </div>
    </div>
  );
}
