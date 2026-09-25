"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
} from "lucide-react";
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
  const [isPageListOpen, setIsPageListOpen] = useState(true);
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
      <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
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
      <div className="absolute left-3 top-3 z-30 w-64 rounded-lg border border-sidebar-border bg-sidebar shadow-lg">
        {titleRow}
      </div>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border">{titleRow}</div>
      <button
        type="button"
        onClick={() => setIsPageListOpen((open) => !open)}
        aria-expanded={isPageListOpen}
        className="mt-2 flex h-7 w-full items-center gap-1.5 px-3 text-[11px] font-semibold text-foreground"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform",
            !isPageListOpen && "-rotate-90",
          )}
        />
        Pages
        <span className="ml-auto font-normal tabular-nums text-muted-foreground">
          {pages.length}
        </span>
      </button>
      {/* Full-width rows hanging off a guide line under the chevron, like a
          file tree. */}
      <nav
        className={cn("min-h-0 flex-1 overflow-y-auto pb-2", !isPageListOpen && "invisible")}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-[17px] w-px bg-foreground/10" />
          {pages.map((page) => {
            const Icon = page.deviceType === "mobile" ? Smartphone : Monitor;
            const isCurrent = focusedPageId === page.id;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => focusPage(page.id)}
                className={cn(
                  "flex h-7 w-full items-center gap-2 pl-8 pr-3 text-left text-xs transition-colors",
                  isCurrent
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", isCurrent && "text-primary")} />
                <span className="truncate">{page.title}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <div className="flex shrink-0 items-center border-t border-sidebar-border p-2">
        {footer}
        <a
          href="https://github.com/Jainex17/Wirely/issues"
          target="_blank"
          rel="noreferrer"
          className="ml-auto px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Feedback
        </a>
      </div>
    </aside>
  );
}
