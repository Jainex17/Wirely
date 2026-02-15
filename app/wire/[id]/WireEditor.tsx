"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Message } from "ai";
import { ArrowLeft } from "lucide-react";
import EditorWorkspace from "@/app/components/EditorWorkspace";
import WirePromptSidebar from "@/app/components/WirePromptSidebar";
import {
  normalizeGeneratedHtml,
  parseBatchWireOutput,
  parseWireOutput,
  userExplicitlyRequestedImages,
} from "@/app/lib/wireOutput";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/app/store/useEditorStore";
import type { WireModelName } from "@/app/lib/wireModels";

interface WireEditorProps {
  wireId: string;
  sessionUser: {
    name: string | null;
    email: string | null;
  };
  initialProject: {
    projectTitle: string;
    pages: Array<{
      id: string;
      title: string;
      pageHtml: string;
    }>;
  };
  initialModelName: WireModelName;
  initialMessages: Message[];
}

export default function WireEditor({
  wireId,
  sessionUser,
  initialProject,
  initialModelName,
  initialMessages,
}: WireEditorProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const hydrateProject = useEditorStore((state) => state.hydrateProject);
  const createPage = useEditorStore((state) => state.createPage);
  const setPageHtml = useEditorStore((state) => state.setPageHtml);

  useEffect(() => {
    hydrateProject(
      initialProject.pages.map((page) => ({
        id: page.id,
        title: page.title,
        iframeHtml: page.pageHtml,
        sections: [],
      })),
    );
  }, [hydrateProject, initialProject.pages]);

  useEffect(() => {
    const hasPreloadedHtml = initialProject.pages.some(
      (page) => page.pageHtml.trim().length > 0,
    );
    if (hasPreloadedHtml) return;

    const latestAssistant = [...initialMessages]
      .reverse()
      .find(
        (message) => message.role === "assistant" && message.content.trim(),
      );
    if (!latestAssistant) return;

    const latestUserPrompt = [...initialMessages]
      .reverse()
      .find(
        (message) => message.role === "user" && message.content.trim(),
      )?.content;
    const allowImages = userExplicitlyRequestedImages(latestUserPrompt ?? "");
    const parsedBatch = parseBatchWireOutput(latestAssistant.content);
    const batchHtml = parsedBatch.htmlByIndex.filter(
      (html) => html.trim().length > 0,
    );
    const htmlCandidates =
      batchHtml.length > 0
        ? batchHtml
        : [parseWireOutput(latestAssistant.content).html];
    const validCandidates = htmlCandidates.filter(
      (html) => html.trim().length > 0,
    );
    if (validCandidates.length === 0) return;

    const pageIds = [...initialProject.pages.map((page) => page.id)];
    for (
      let index = pageIds.length;
      index < validCandidates.length;
      index += 1
    ) {
      const createdId = createPage(`Page ${index + 1}`);
      pageIds.push(createdId);
    }

    validCandidates.forEach((html, index) => {
      const targetPageId = pageIds[index];
      if (!targetPageId) return;
      const normalized = normalizeGeneratedHtml(html, { allowImages });
      setPageHtml(targetPageId, normalized.html);
    });
  }, [createPage, initialMessages, initialProject.pages, setPageHtml]);

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

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await authClient.signOut();
    } finally {
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-muted p-3 gap-2 overflow-hidden">
      <header className="h-14 bg-card border border-border rounded-lg shadow-sm px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push("/")}
              aria-label="Back to home"
              title="Back to home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">
              {initialProject.projectTitle}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/40"
              >
                <span className="max-w-[220px] truncate text-sm font-medium text-foreground">
                  {name}
                </span>
                <div className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                  {initials || "U"}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 border-0 shadow-none"
            >
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleLogout}
                disabled={isLoggingOut}
                variant="destructive"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="w-full flex-1 h-[calc(100vh-5.75rem)] flex gap-2">
        <div className="w-[75%] min-w-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <EditorWorkspace sidebarMode="wire" />
        </div>
        <div className="w-[25%] min-w-[320px] bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <WirePromptSidebar
            variant="panel"
            wireId={wireId}
            initialModelName={initialModelName}
            initialMessages={initialMessages}
          />
        </div>
      </div>
    </div>
  );
}
