"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import type { Message } from "ai";
// Prototype flow hidden for now — re-enable together with the
// <PrototypeFlowDialog> block and the isPrototypeDialogOpen state below.
// import { ArrowLeft, Cloud, Workflow } from "lucide-react";
// import { ArrowLeft, Cloud } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import EditorWorkspace from "@/components/EditorWorkspace";
// import PrototypeFlowDialog from "@/components/PrototypeFlowDialog";
import UserAccountMenu, { type UserAccountMenuUser } from "@/components/UserAccountMenu";
import WirePromptSidebar from "@/components/WirePromptSidebar";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/useEditorStore";
import type { WireModelName } from "@/lib/wireModels";
import EditorErrorBoundary from "@/components/EditorErrorBoundary";
import type { PersistedWireLayout } from "@/lib/types";
import { resolvePromptTargetPageId } from "@/lib/wirePromptTarget";
import type { WireConversationModelUsage } from "@/lib/wireConversationModels";

interface WireEditorProps {
  wireId: string;
  sessionUser: UserAccountMenuUser;
  initialProject: {
    projectTitle: string;
    pages: Array<{
      id: string;
      title: string;
      pageHtml: string;
      deviceType: "desktop" | "mobile";
    }>;
  };
  initialModelName: WireModelName;
  initialMessages: Array<
    Message &
      WireConversationModelUsage & {
        planningSummary?: string | null;
      }
  >;
}

const getWireLayoutStorageKey = (wireId: string) => `wirely-wire-layout:${wireId}`;

export default function WireEditor({
  wireId,
  sessionUser,
  initialProject,
  initialModelName,
  initialMessages,
}: WireEditorProps) {
  const { signOut } = useClerk();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedPromptPageId, setSelectedPromptPageId] = useState<string | null>(
    null,
  );
  const [promptFocusRequestKey, setPromptFocusRequestKey] = useState(0);
  // const [isPrototypeDialogOpen, setIsPrototypeDialogOpen] = useState(false);
  const hydrateProject = useEditorStore((state) => state.hydrateProject);
  const hydratePageLayout = useEditorStore((state) => state.hydratePageLayout);
  const setFocusedPage = useEditorStore((state) => state.setFocusedPage);
  // Saving indicator hidden for now — restore with the header cloud icon.
  // const isSaving = useEditorStore((state) => state.pendingSaveCount > 0);
  const pages = useEditorStore((state) => state.pages);

  useEffect(() => {
    hydrateProject(
      initialProject.pages.map((page) => ({
        id: page.id,
        title: page.title,
        iframeHtml: page.pageHtml,
        deviceType: page.deviceType,
        sections: [],
      })),
    );
  }, [hydrateProject, initialProject.pages]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(getWireLayoutStorageKey(wireId));
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedWireLayout;

      hydratePageLayout(parsed);
    } catch {
      hydratePageLayout({});
    }
  }, [hydratePageLayout, wireId]);

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  useEffect(() => {
    setSelectedPromptPageId((currentPageId) =>
      resolvePromptTargetPageId(pages, currentPageId),
    );
  }, [pages]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await signOut();
    } finally {
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  const handleEditPage = (pageId: string) => {
    setFocusedPage(pageId);
    setSelectedPromptPageId(pageId);
    setPromptFocusRequestKey((currentKey) => currentKey + 1);
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] hidden items-center justify-center bg-background/85 p-4 backdrop-blur-sm max-[755px]:flex">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-foreground">Larger screen required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Open this page on a tablet or desktop for full editing access.
          </p>
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={() => router.push("/")}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>

      <div className="h-screen w-full flex flex-col bg-muted p-3 gap-2 overflow-hidden max-[755px]:hidden">
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
            {/* Saving indicator hidden for now
            {isSaving ? (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/70 text-muted-foreground"
                aria-live="polite"
                aria-label="Saving changes"
                title="Saving changes"
              >
                <Cloud className="h-4 w-4 animate-pulse text-foreground/70" />
              </div>
            ) : null}
            */}
            {/* Prototype flow hidden for now
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setIsPrototypeDialogOpen(true)}
            >
              <Workflow className="mr-1.5 h-4 w-4" />
              Prototype
            </Button>
            */}
            <UserAccountMenu
              user={sessionUser}
              isLoggingOut={isLoggingOut}
              onLogout={handleLogout}
              logoutDescription="You will need to sign in again to continue editing this wireframe."
            />
          </div>
        </header>
        <div className="w-full flex-1 h-[calc(100vh-5.75rem)] flex gap-2">
          <EditorErrorBoundary title="Workspace canvas crashed">
            <div className="w-[75%] min-w-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              <EditorWorkspace
                sidebarMode="wire"
                projectId={wireId}
                onEditPage={handleEditPage}
              />
            </div>
          </EditorErrorBoundary>
          <EditorErrorBoundary title="Prompt panel crashed">
            <div className="w-[25%] min-w-[320px] bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              <WirePromptSidebar
                variant="panel"
                wireId={wireId}
                initialModelName={initialModelName}
                initialMessages={initialMessages}
                selectedPageId={selectedPromptPageId}
                onSelectedPageIdChange={setSelectedPromptPageId}
                focusRequestKey={promptFocusRequestKey}
              />
            </div>
          </EditorErrorBoundary>
        </div>
      </div>

      {/* Prototype flow hidden for now
      <PrototypeFlowDialog
        wireId={wireId}
        projectTitle={initialProject.projectTitle}
        open={isPrototypeDialogOpen}
        onOpenChange={setIsPrototypeDialogOpen}
      />
      */}
    </>
  );
}
