"use client";

import EditorWorkspace from "@/app/components/EditorWorkspace";
import WirePromptSidebar from "@/app/components/WirePromptSidebar";

interface WireEditorProps {
  wireId: string;
}

export default function WireEditor({ wireId }: WireEditorProps) {
  return (
    <div className="h-screen w-screen flex flex-col bg-muted p-3 gap-3">
      <header className="h-14 bg-card border border-border rounded-lg shadow-sm px-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold text-foreground">
              Wireframe Workspace
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">Jainex</p>
            <p className="text-xs text-muted-foreground">Design Operator</p>
          </div>
          <div className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
            JX
          </div>
        </div>
      </header>
      <div className="w-full flex-1 min-h-0 flex gap-3">
        <div className="w-[70%] h-full min-w-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <EditorWorkspace sidebarMode="wire" />
        </div>
        <div className="w-[30%] h-full min-w-[320px] bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <WirePromptSidebar variant="panel" wireId={wireId} />
        </div>
      </div>
    </div>
  );
}
