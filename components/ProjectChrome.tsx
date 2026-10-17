"use client";

/**
 * The project-wide controls, laid out the way Figma does it: the way home, the
 * project title, and the canvas switch head the left panel, and Play, Tokens,
 * and Share head the right one, so the canvas runs the full height. Both
 * editors render these from the context ProjectEditor provides.
 */

import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";
import { createContext, type ReactNode, use } from "react";
import DesignTokensDialog from "@/components/DesignTokensDialog";
import ShareProjectButton from "@/components/ShareProjectButton";
import { cn } from "@/lib/utils";
import type { CanvasView } from "@/store/useEditorStore";

export const CANVAS_VIEWS: ReadonlyArray<{ view: CanvasView; label: string; detail: string; code: string }> = [
  { view: "html", label: "Pages", detail: "HTML pages your agent writes. Press Play to click through them.", code: "Digit1" },
  { view: "design", label: "Editor", detail: "Screens made of layers you edit by hand, like Figma frames.", code: "Digit2" },
];

export const ProjectChromeContext = createContext<{
  projectId: string;
  projectTitle: string;
  view: CanvasView;
  onViewChange: (view: CanvasView) => void;
} | null>(null);

function useProjectChrome() {
  const chrome = use(ProjectChromeContext);
  if (!chrome) throw new Error("ProjectChrome needs a ProjectChromeContext provider.");
  return chrome;
}

/** Pages and Editor as one segmented control. Alt plus the number switches too. */
function CanvasSwitch({ className }: { className?: string }) {
  const { view, onViewChange } = useProjectChrome();
  return (
    <div role="tablist" aria-label="Canvas" className={cn("flex rounded-md bg-foreground/[0.06] p-0.5", className)}>
      {CANVAS_VIEWS.map((option) => (
        <button
          key={option.view}
          type="button"
          role="tab"
          aria-selected={view === option.view}
          data-tip={`${option.label} (Alt+${option.code.slice(-1)})`}
          data-tip-detail={option.detail}
          onClick={() => onViewChange(option.view)}
          className={cn(
            "h-6 flex-1 rounded px-2.5 text-xs font-medium transition-colors",
            view === option.view
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/projects"
      aria-label="Back to projects"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
    </Link>
  );
}

/** The top of the left panel. `end` holds the panel's collapse toggle. */
export function ProjectHeader({ end }: { end: ReactNode }) {
  const { projectTitle } = useProjectChrome();
  return (
    // Two 48px rows, so its bottom edge lines up with the right panel's tabs.
    <div className="shrink-0 border-b border-sidebar-border px-1.5">
      <div className="flex h-12 items-center gap-1">
        <BackLink />
        <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{projectTitle}</h1>
        {end}
      </div>
      <div className="flex h-12 items-center px-1.5">
        <CanvasSwitch className="w-full" />
      </div>
    </div>
  );
}

/** The collapsed left panel: the same header, floating over the canvas corner. */
export function FloatingProjectHeader({ end }: { end: ReactNode }) {
  const { projectTitle } = useProjectChrome();
  return (
    <div className="absolute left-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar p-1 shadow-lg">
      <BackLink />
      <h1 className="max-w-40 truncate pr-1 text-xs font-semibold text-foreground">{projectTitle}</h1>
      <CanvasSwitch />
      {end}
    </div>
  );
}

/** Play, Tokens, and Share. Share is the one filled button, as in Figma. */
export function ProjectActions() {
  const { projectId } = useProjectChrome();
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/wire/${projectId}/prototype`}
        aria-label="Play"
        data-tip="Play"
        data-tip-detail="Click through the pages"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <Play className="h-4 w-4" />
      </Link>
      <DesignTokensDialog projectId={projectId} />
      <ShareProjectButton projectId={projectId} />
    </div>
  );
}

/**
 * The top row of the right panel: its collapse toggle and an optional status
 * on the left, the project actions on the right.
 */
export function ProjectActionsBar({ toggle, status }: { toggle: ReactNode; status?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border px-2">
      {toggle}
      {status}
      <div className="ml-auto">
        <ProjectActions />
      </div>
    </div>
  );
}

/** The collapsed right panel: zoom, the actions, and the way back, floating over the canvas corner. */
export function FloatingProjectActions({ toggle, zoom, status }: { toggle: ReactNode; zoom: ReactNode; status?: ReactNode }) {
  return (
    <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar p-1 shadow-lg">
      {status}
      {zoom}
      <ProjectActions />
      {toggle}
    </div>
  );
}
