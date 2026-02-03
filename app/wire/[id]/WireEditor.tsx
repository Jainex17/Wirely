"use client";

import { useCallback } from "react";
import EditorWorkspace from "@/app/components/EditorWorkspace";
import WirePromptSidebar from "@/app/components/WirePromptSidebar";
import { useEditorStore } from "@/app/store/useEditorStore";

interface WireEditorProps {
  wireId: string;
  prompt?: string;
}

export default function WireEditor({ wireId, prompt }: WireEditorProps) {
  const initializeWireDefaults = useEditorStore(
    (state) => state.initializeWireDefaults,
  );

  const handleInitialize = useCallback(() => {
    const existing = localStorage.getItem("openwire-editor-storage");
    if (!existing) {
      initializeWireDefaults();
    }
  }, [initializeWireDefaults]);

  return (
    <EditorWorkspace
      sidebarMode="wire"
      onInitialize={handleInitialize}
      promptPrefill={prompt}
      rightSidebar={<WirePromptSidebar promptPrefill={prompt} wireId={wireId} />}
    />
  );
}
