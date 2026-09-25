"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Monitor, PanelLeftClose, PanelLeftOpen, Smartphone } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/useEditorStore";

interface PagesPanelProps {
  projectTitle: string;
  isCollapsed: boolean;
  onToggle: () => void;
  footer: ReactNode;
}

/**
 * The editor's left column: project title, the list of every page on the
 * canvas, and the account menu. Clicking a page pans the canvas to it at the
 * current zoom. Collapsed, it shrinks to a floating title card over the canvas
 * so the toggle back stays in the same corner.
 */
export default function PagesPanel({
  projectTitle,
  isCollapsed,
  onToggle,
  footer,
}: PagesPanelProps) {
  const router = useRouter();
  const { pages, focusedPageId, focusPage } = useEditorStore(
    useShallow((state) => ({
      pages: state.pages,
      focusedPageId: state.focusedPageId,
      focusPage: state.focusPage,
    })),
  );

  const titleRow = (
    <div className="flex h-12 shrink-0 items-center gap-1 px-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => router.push("/")}
        aria-label="Back to home"
        title="Back to home"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {projectTitle}
      </h1>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onToggle}
        aria-label={isCollapsed ? "Show pages panel" : "Hide pages panel"}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? "Show pages panel" : "Hide pages panel"}
      >
        {isCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  if (isCollapsed) {
    return (
      <div className="absolute left-3 top-3 z-30 w-64 rounded-lg border border-border bg-card shadow-lg">
        {titleRow}
      </div>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      <div className="border-b border-border">{titleRow}</div>
      <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">
        Pages ({pages.length})
      </p>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {pages.map((page) => {
          const Icon = page.deviceType === "mobile" ? Smartphone : Monitor;
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => focusPage(page.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent",
                focusedPageId === page.id && "bg-accent",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{page.title}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center border-t border-border p-2">{footer}</div>
    </aside>
  );
}
