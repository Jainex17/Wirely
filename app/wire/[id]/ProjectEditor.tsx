"use client";

import { FileCode2, PencilRuler } from "lucide-react";
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
 * The strip across the top of the project, one file-style tab for each canvas.
 * It sits outside both editors, so it stays up while the design module loads
 * and when it fails to.
 */
function ViewTabs({ view, onChange }: { view: EditorView; onChange: (view: EditorView) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Canvas"
      className="editor-theme flex h-11 shrink-0 items-end gap-1 border-b border-sidebar-border bg-sidebar px-3 pt-1.5"
    >
      {VIEWS.map(({ view: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={view === option}
          onClick={() => onChange(option)}
          className={cn(
            "mb-1 flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors",
            view === option
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

interface ProjectEditorProps {
  initialView: EditorView;
  wire: ComponentProps<typeof WireEditor>;
  design: ComponentProps<typeof DesignEditor>;
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
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <ViewTabs view={view} onChange={changeView} />
      <div className="min-h-0 flex-1">
        {view === "design" ? <DesignEditor {...design} /> : <WireEditor {...wire} />}
      </div>
    </div>
  );
}
