"use client";

import { useEffect, useState } from "react";
import type { PageDeviceType } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import type { Message } from "ai";
// Prototype flow hidden for now — re-enable together with the
// <PrototypeFlowDialog> block and the isPrototypeDialogOpen state below.
// import { ArrowLeft, Cloud, Workflow } from "lucide-react";
// import { ArrowLeft, Cloud } from "lucide-react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import EditorWorkspace from "@/components/EditorWorkspace";
import PagesPanel from "@/components/PagesPanel";
// import PrototypeFlowDialog from "@/components/PrototypeFlowDialog";
import UserAccountMenu, { type UserAccountMenuUser } from "@/components/UserAccountMenu";
import WirePromptSidebar from "@/components/WirePromptSidebar";
import AgentActivityPanel from "@/components/AgentActivityPanel";
import NodeInspector from "@/components/NodeInspector";
import { CanvasZoomControls } from "@/components/CanvasToolbar";
import ShareProjectButton from "@/components/ShareProjectButton";
import DesignTokensDialog from "@/components/DesignTokensDialog";
import type { ProjectComment } from "@/lib/projectComments";
import { Button } from "@/components/ui/button";
import { type ServerPageChanges, useEditorStore } from "@/store/useEditorStore";
import type { WireModelName } from "@/lib/wireModels";
import EditorErrorBoundary from "@/components/EditorErrorBoundary";
import type { PersistedWireLayout } from "@/lib/types";
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
      deviceType: PageDeviceType;
    }>;
  };
  /** Server time the initial pages were read, the first change cursor. */
  pagesLoadedAt: string;
  initialModelName: WireModelName;
  initialMessages: Array<
    Message &
      WireConversationModelUsage & {
        planningSummary?: string | null;
      }
  >;
}

const getWireLayoutStorageKey = (wireId: string) => `wirely-wire-layout:${wireId}`;

const PAGE_SYNC_INTERVAL_MS = 2_500;
// An open tab with no agent writing would otherwise keep the database awake
// with a query every 2.5 seconds. Once pages stop changing, poll slower.
const PAGE_SYNC_IDLE_INTERVAL_MS = 10_000;
const PAGE_SYNC_IDLE_AFTER_MS = 2 * 60_000;
// Review comments come from other people, slower than an agent writes pages.
const COMMENT_SYNC_INTERVAL_MS = 20_000;

export default function WireEditor({
  wireId,
  sessionUser,
  initialProject,
  pagesLoadedAt,
  initialModelName,
  initialMessages,
}: WireEditorProps) {
  const { signOut } = useClerk();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [promptFocusRequestKey, setPromptFocusRequestKey] = useState(0);
  // Collapsing either side panel gives the canvas that width. Each toggle stays
  // on screen while its panel is hidden, so it doubles as the restore button.
  const [isPromptPanelCollapsed, setIsPromptPanelCollapsed] = useState(false);
  const [isPagesPanelCollapsed, setIsPagesPanelCollapsed] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "design" | "activity">("chat");
  // const [isPrototypeDialogOpen, setIsPrototypeDialogOpen] = useState(false);
  const hydrateProject = useEditorStore((state) => state.hydrateProject);
  const hydratePageLayout = useEditorStore((state) => state.hydratePageLayout);
  const setFocusedPage = useEditorStore((state) => state.setFocusedPage);
  const applyServerPageChanges = useEditorStore((state) => state.applyServerPageChanges);
  // Saving indicator hidden for now — restore with the header cloud icon.
  // const isSaving = useEditorStore((state) => state.pendingSaveCount > 0);

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

  // An MCP agent writes pages from outside this tab. Polling while the tab is
  // visible shows those writes live without a reload; a hidden tab skips its
  // ticks so it costs no requests. Coming back to the tab polls at once and
  // resets the idle backoff, since the user was likely just prompting.
  useEffect(() => {
    let cursor = pagesLoadedAt;
    let inFlight = false;
    let lastChangeAt = Date.now();
    let timeoutId = 0;
    let isStopped = false;
    // Each schedule() starts a new chain. A tick that finishes after wake()
    // started a newer one ends its own, so only one chain ever runs.
    let chain = 0;

    const poll = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch(
          `/api/projects/${wireId}/pages?since=${encodeURIComponent(cursor)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as ServerPageChanges & { cursor: string };
        // The store drops a poll while a save is in flight. Keep the old
        // cursor then, so the next poll asks for these changes again.
        if (useEditorStore.getState().pendingSaveCount > 0) return;
        cursor = payload.cursor;
        if (payload.changed.length > 0) lastChangeAt = Date.now();
        applyServerPageChanges(payload);
      } catch {
        // A dropped poll is retried on the next tick.
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      // A poll still in flight at unmount must not start another timer.
      if (isStopped) return;
      const isIdle = Date.now() - lastChangeAt > PAGE_SYNC_IDLE_AFTER_MS;
      const thisChain = ++chain;
      timeoutId = window.setTimeout(
        async () => {
          await poll();
          if (thisChain === chain) schedule();
        },
        isIdle ? PAGE_SYNC_IDLE_INTERVAL_MS : PAGE_SYNC_INTERVAL_MS,
      );
    };

    const wake = () => {
      if (document.visibilityState !== "visible") return;
      lastChangeAt = Date.now();
      window.clearTimeout(timeoutId);
      void poll();
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      isStopped = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [applyServerPageChanges, pagesLoadedAt, wireId]);

  useEffect(() => {
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/projects/${wireId}/comments`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { comments?: ProjectComment[] };
        if (payload.comments) useEditorStore.getState().setComments(payload.comments);
      } catch {
        // A dropped load is retried on the next tick.
      }
    };

    void load();
    const intervalId = window.setInterval(load, COMMENT_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", load);
    };
  }, [wireId]);

  // Tells the server what the user picked, so an MCP agent's get_selection can
  // act on "this" without the user copying a link. A picked element wins over
  // the focused page, and a burst of clicks sends only the last one.
  useEffect(() => {
    let timeoutId = 0;
    let lastSent = "";
    const unsubscribe = useEditorStore.subscribe((state) => {
      const pageId = state.selectedNode?.pageId ?? state.focusedPageId;
      const nodeId = state.selectedNode?.nodeId ?? null;
      const key = `${pageId}:${nodeId}`;
      if (!pageId || key === lastSent) return;
      lastSent = key;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        void fetch(`/api/projects/${wireId}/selection`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId, nodeId }),
        }).catch(() => undefined);
      }, 400);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, [wireId]);

  // Picking a new element opens its properties, as selecting a layer does in
  // Figma. The chat keeps a chip for it, so a prompt still edits just that element.
  useEffect(
    () =>
      useEditorStore.subscribe((state, previous) => {
        const node = state.selectedNode;
        const before = previous.selectedNode;
        if (node && (node.pageId !== before?.pageId || node.nodeId !== before?.nodeId)) {
          setSidebarTab("design");
        }
      }),
    [],
  );

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

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

  const pagesPanel = (
    <PagesPanel
      projectTitle={initialProject.projectTitle}
      isCollapsed={isPagesPanelCollapsed}
      onToggle={() => setIsPagesPanelCollapsed((collapsed) => !collapsed)}
      footer={
        <UserAccountMenu
          user={sessionUser}
          isLoggingOut={isLoggingOut}
          onLogout={handleLogout}
          logoutDescription="You will need to sign in again to continue editing this wireframe."
        />
      }
    />
  );

  const handleEditPage = (pageId: string) => {
    // The sidebar targets the focused page when the prompt names no other.
    setFocusedPage(pageId);
    setSidebarTab("chat");
    setPromptFocusRequestKey((currentKey) => currentKey + 1);
  };

  const promptPanelToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setIsPromptPanelCollapsed((collapsed) => !collapsed)}
      aria-label={isPromptPanelCollapsed ? "Show prompt panel" : "Hide prompt panel"}
      aria-expanded={!isPromptPanelCollapsed}
      title={isPromptPanelCollapsed ? "Show prompt panel" : "Hide prompt panel"}
    >
      {isPromptPanelCollapsed ? (
        <PanelRightOpen className="h-4 w-4" />
      ) : (
        <PanelRightClose className="h-4 w-4" />
      )}
    </Button>
  );

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

      <div className="editor-theme h-screen w-full flex bg-background text-foreground overflow-hidden max-[755px]:hidden">
        {isPagesPanelCollapsed ? null : pagesPanel}
        <EditorErrorBoundary title="Workspace canvas crashed">
          <div className="relative flex-1 min-w-0 bg-background overflow-hidden">
            {isPagesPanelCollapsed ? pagesPanel : null}
            <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
              <DesignTokensDialog projectId={wireId} />
              <ShareProjectButton projectId={wireId} />
              <CanvasZoomControls />
              {isPromptPanelCollapsed ? (
                <div className="rounded-lg border border-sidebar-border bg-sidebar p-0.5 shadow-lg">
                  {promptPanelToggle}
                </div>
              ) : null}
            </div>
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
            <EditorWorkspace
              sidebarMode="wire"
              projectId={wireId}
              onEditPage={handleEditPage}
            />
          </div>
        </EditorErrorBoundary>
        <EditorErrorBoundary title="Prompt panel crashed">
          {/* Kept mounted while collapsed so an in-flight generation stream
              in the sidebar survives the toggle. */}
          <div
            className={
              isPromptPanelCollapsed
                ? "hidden"
                : "flex w-72 shrink-0 flex-col overflow-hidden border-l border-sidebar-border bg-sidebar"
            }
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border pl-2 pr-2">
              <div role="tablist" className="flex items-center gap-0.5">
                {(["chat", "design", "activity"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={sidebarTab === tab}
                    onClick={() => setSidebarTab(tab)}
                    className={
                      sidebarTab === tab
                        ? "rounded-md bg-foreground/10 px-2.5 py-1 text-[13px] font-semibold text-foreground"
                        : "rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                    }
                  >
                    {{ chat: "Chat", design: "Design", activity: "Agent activity" }[tab]}
                  </button>
                ))}
              </div>
              {promptPanelToggle}
            </div>
            {/* The chat stays mounted on the activity tab for the same reason. */}
            <div className={sidebarTab === "chat" ? "min-h-0 flex-1" : "hidden"}>
              <WirePromptSidebar
                wireId={wireId}
                initialModelName={initialModelName}
                initialMessages={initialMessages}
                focusRequestKey={promptFocusRequestKey}
              />
            </div>
            {sidebarTab === "design" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NodeInspector projectId={wireId} variant="panel" />
              </div>
            ) : null}
            {sidebarTab === "activity" ? (
              <div className="min-h-0 flex-1">
                <AgentActivityPanel projectId={wireId} isActive={!isPromptPanelCollapsed} />
              </div>
            ) : null}
          </div>
        </EditorErrorBoundary>
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
