"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Message } from "ai";
import { ArrowLeft, Cloud } from "lucide-react";
import EditorWorkspace from "@/components/EditorWorkspace";
import WirePromptSidebar from "@/components/WirePromptSidebar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditorStore } from "@/store/useEditorStore";
import type { WireModelName } from "@/lib/wireModels";
import EditorErrorBoundary from "@/components/EditorErrorBoundary";
import { resolvePromptTargetPageId } from "@/lib/wirePromptTarget";
import { createDefaultCamera } from "@/lib/canvasScene";

interface WireEditorProps {
  wireId: string;
  sessionUser: {
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
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

const getWireLayoutStorageKey = (wireId: string) => `wirely-wire-layout:${wireId}`;
const passthroughImageLoader = ({ src }: { src: string }) => src;

export default function WireEditor({
  wireId,
  sessionUser,
  initialProject,
  initialModelName,
  initialMessages,
}: WireEditorProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [selectedPromptPageId, setSelectedPromptPageId] = useState<string | null>(
    null,
  );
  const [promptFocusRequestKey, setPromptFocusRequestKey] = useState(0);
  const hydrateProject = useEditorStore((state) => state.hydrateProject);
  const hydratePageLayout = useEditorStore((state) => state.hydratePageLayout);
  const setFocusedPage = useEditorStore((state) => state.setFocusedPage);
  const isSaving = useEditorStore((state) => state.pendingSaveCount > 0);
  const pages = useEditorStore((state) => state.pages);

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
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(getWireLayoutStorageKey(wireId));
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        version?: number;
        camera?: { x?: number; y?: number; zoom?: number };
        pagePositions?: Record<string, { x: number; y: number }>;
        pageStackOrder?: string[];
      };

      hydratePageLayout({
        camera:
          parsed.camera && typeof parsed.camera === "object"
            ? {
                x: parsed.camera.x ?? 0,
                y: parsed.camera.y ?? 0,
                zoom: parsed.camera.zoom ?? createDefaultCamera().zoom,
              }
            : createDefaultCamera(),
        pagePositions: parsed.pagePositions ?? {},
        pageStackOrder: parsed.pageStackOrder ?? [],
      });
    } catch {
      hydratePageLayout({
        camera: createDefaultCamera(),
        pagePositions: {},
        pageStackOrder: [],
      });
    }
  }, [hydratePageLayout, wireId]);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/profile");
  }, [router]);

  useEffect(() => {
    setSelectedPromptPageId((currentPageId) =>
      resolvePromptTargetPageId(pages, currentPageId),
    );
  }, [pages]);

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
    setIsLogoutConfirmOpen(false);
    setIsLoggingOut(true);

    try {
      await authClient.signOut();
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  suppressHydrationWarning
                  className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/40"
                >
                  <span className="max-w-[220px] truncate text-sm font-medium text-foreground">
                    {name}
                  </span>
                  {sessionUser.avatarUrl ? (
                    <Image
                      loader={passthroughImageLoader}
                      unoptimized
                      src={sessionUser.avatarUrl}
                      alt={`${name} avatar`}
                      width={28}
                      height={28}
                      sizes="28px"
                      className="h-7 w-7 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                      {initials || "U"}
                    </div>
                  )}
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
                  onClick={() => setIsLogoutConfirmOpen(true)}
                  disabled={isLoggingOut}
                  variant="destructive"
                >
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <AlertDialog
          open={isLogoutConfirmOpen}
          onOpenChange={(open) => {
            if (!isLoggingOut) setIsLogoutConfirmOpen(open);
          }}
        >
          <AlertDialogContent className="logout-dialog sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Log out of Wirely?</AlertDialogTitle>
              <AlertDialogDescription>
                You will need to sign in again to continue editing this wireframe.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isLoggingOut}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="logout-dialog-action"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Logging out..." : "Log out"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
    </>
  );
}
