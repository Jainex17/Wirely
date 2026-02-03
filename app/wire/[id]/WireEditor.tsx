"use client";

import EditorWorkspace from "@/app/components/EditorWorkspace";
import WirePromptSidebar from "@/app/components/WirePromptSidebar";

interface WireEditorProps {
  wireId: string;
  prompt?: string;
}

export default function WireEditor({ wireId, prompt }: WireEditorProps) {
  return (
    <div className="h-screen w-screen flex flex-col bg-muted p-3 gap-3">
      <div className="w-full h-14 bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        hello
      </div>
      <div className="w-full h-full flex gap-3">
        <div className="w-[70%] h-full min-w-0 bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <EditorWorkspace sidebarMode="wire" promptPrefill={prompt} />
        </div>
        <div className="w-[30%] h-full min-w-[320px] bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <WirePromptSidebar
            variant="panel"
            promptPrefill={prompt}
            wireId={wireId}
          />
        </div>
      </div>
    </div>
  );
}
