"use client";

import { useEffect, useMemo } from "react";
import type { Message } from "ai";
import EditorWorkspace from "@/app/components/EditorWorkspace";
import WirePromptSidebar from "@/app/components/WirePromptSidebar";
import { useEditorStore } from "@/app/store/useEditorStore";

interface WireEditorProps {
  wireId: string;
  sessionUser: {
    name: string | null;
    email: string | null;
  };
  initialProject: {
    pageId: string;
    pageTitle: string;
    pageHtml: string;
  };
  initialMessages: Message[];
}

export default function WireEditor({
  wireId,
  sessionUser,
  initialProject,
  initialMessages,
}: WireEditorProps) {
  const hydrateProject = useEditorStore((state) => state.hydrateProject);

  useEffect(() => {
    hydrateProject([
      {
        id: initialProject.pageId,
        title: initialProject.pageTitle,
        iframeHtml: initialProject.pageHtml,
        sections: [],
      },
    ]);
  }, [
    hydrateProject,
    initialProject.pageHtml,
    initialProject.pageId,
    initialProject.pageTitle,
  ]);

  const name = sessionUser.name ?? sessionUser.email ?? "User";
  const initials = useMemo(
    () =>
      name
        .split(" ")
        .map((part) => part[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [name],
  );

  return (
    <div className="min-h-screen w-full flex flex-col bg-muted p-3 gap-3">
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
            <p className="text-sm font-medium text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">Design Operator</p>
          </div>
          <div className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
            {initials || "U"}
          </div>
        </div>
      </header>
      <div className="w-full flex-1 min-h-[calc(100vh-8.5rem)] flex gap-3">
        <div className="w-[70%] min-w-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <EditorWorkspace sidebarMode="wire" />
        </div>
        <div className="w-[30%] min-w-[320px] bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <WirePromptSidebar
            variant="panel"
            wireId={wireId}
            initialMessages={initialMessages}
          />
        </div>
      </div>
    </div>
  );
}
