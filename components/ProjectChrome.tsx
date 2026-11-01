"use client";

/**
 * The project-wide controls, laid out the way Figma does it: the way home and
 * the project title head the left panel, and Play, Tokens, and Share head the
 * right one, so the canvas runs the full height. They read the project from
 * the context ProjectEditor provides.
 */

import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";
import { createContext, type ReactNode, use } from "react";
import ImportDialog from "@/components/ImportDialog";
import ShareProjectButton from "@/components/ShareProjectButton";

export const ProjectChromeContext = createContext<{
  projectId: string;
  projectTitle: string;
} | null>(null);

function useProjectChrome() {
  const chrome = use(ProjectChromeContext);
  if (!chrome) throw new Error("ProjectChrome needs a ProjectChromeContext provider.");
  return chrome;
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
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border px-1.5">
      <BackLink />
      <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{projectTitle}</h1>
      {end}
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
      {end}
    </div>
  );
}

/** Import, Play, and Share. Share is the one filled button, as in Figma. */
export function ProjectActions() {
  const { projectId } = useProjectChrome();
  return (
    <div className="flex items-center gap-1">
      <ImportDialog projectId={projectId} />
      <Link
        href={`/wire/${projectId}/prototype`}
        aria-label="Play"
        data-tip="Play"
        data-tip-detail="Click through the pages"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <Play className="h-4 w-4" />
      </Link>
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
