"use client";

import { type ComponentProps, useState } from "react";
import DesignEditor from "@/components/design/DesignEditorLoader";
import { cn } from "@/lib/utils";
import WireEditor from "./WireEditor";

export type EditorView = "html" | "design";

const VIEW_LABELS: Record<EditorView, string> = { html: "HTML", design: "Design" };

/** The tab switch at the top of both canvases. */
function ViewTabs({ view, onChange }: { view: EditorView; onChange: (view: EditorView) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Canvas"
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-sidebar p-0.5 text-xs shadow-lg"
    >
      {(Object.keys(VIEW_LABELS) as EditorView[]).map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={view === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            view === option ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {VIEW_LABELS[option]}
        </button>
      ))}
    </div>
  );
}

interface ProjectEditorProps {
  initialView: EditorView;
  wire: Omit<ComponentProps<typeof WireEditor>, "viewTabs">;
  design: Omit<ComponentProps<typeof DesignEditor>, "viewTabs">;
}

/**
 * One project, two canvases: HTML pages on one tab, design screens on the
 * other. Only the open tab is mounted. Both keep their state on the server and
 * in the editor store, so switching back finds the canvas as it was left. The
 * tab is kept in the URL, so a reload or a shared link opens the same one.
 */
export default function ProjectEditor({ initialView, wire, design }: ProjectEditorProps) {
  const [view, setView] = useState(initialView);
  const changeView = (next: EditorView) => {
    setView(next);
    // Both tabs are written explicitly, so a project that defaults to Design
    // still reloads on HTML when that is what the user picked.
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  };
  const tabs = <ViewTabs view={view} onChange={changeView} />;
  return view === "design" ? <DesignEditor {...design} viewTabs={tabs} /> : <WireEditor {...wire} viewTabs={tabs} />;
}
