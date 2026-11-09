"use client";

import { Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
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
import { parseTabName } from "@/lib/projectTabs";
import { cn } from "@/lib/utils";
import { createTab, deleteTab, renameTab } from "@/store/tabActions";
import { useEditorStore } from "@/store/useEditorStore";

/**
 * The strip over the canvas, one tab per canvas of the project. It shows even
 * with one tab, so the "+" is there to find. Double-click renames a tab in
 * place. The open tab carries a delete button that asks first, since the
 * tab's pages go with it, and is off while the tab is the last one or holds
 * every page.
 */
export default function CanvasTabs({ projectId }: { projectId: string }) {
  const { tabs, activeTabId, pages, switchTab } = useEditorStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      pages: state.pages,
      switchTab: state.switchTab,
    })),
  );
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deletingTabId, setDeletingTabId] = useState<string | null>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  // Escape closes the field, and a browser that fires blur on the removed
  // field must not commit the draft the user just cancelled.
  const isCancellingRef = useRef(false);

  const pageCountOf = (tabId: string) => pages.filter((page) => page.tabId === tabId).length;
  const deletingTab = tabs.find((tab) => tab.id === deletingTabId) ?? null;

  const startRename = (tabId: string, name: string) => {
    isCancellingRef.current = false;
    setEditingTabId(tabId);
    setDraft(name);
  };

  const commitRename = () => {
    if (!editingTabId || isCancellingRef.current) return;
    const name = parseTabName(draft);
    // An empty or overlong name leaves the old one, as a cancel would.
    if (name) void renameTab(projectId, editingTabId, name);
    setEditingTabId(null);
  };

  const handleAdd = async () => {
    const tabId = await createTab(projectId);
    if (!tabId) return;
    const name = useEditorStore.getState().tabs.find((tab) => tab.id === tabId)?.name ?? "";
    startRename(tabId, name);
  };

  // Left and right move between tabs and keep keyboard focus on the strip.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    switchTab(next.id);
    buttonsRef.current.get(next.id)?.focus();
  };

  const deleteBlocker = (tabId: string) =>
    tabs.length <= 1
      ? "A project keeps at least one tab."
      : pageCountOf(tabId) === pages.length
        ? "A project keeps at least one page. Move a page to another tab first."
        : null;

  return (
    <>
      <div className="absolute left-1/2 top-3 z-30 flex max-w-[min(60vw,640px)] -translate-x-1/2 items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar p-1 shadow-lg">
        <div
          role="tablist"
          aria-label="Canvas tabs"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:thin]"
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const isEditing = tab.id === editingTabId;
            const blocker = isActive ? deleteBlocker(tab.id) : null;
            return (
              <div key={tab.id} className="group flex shrink-0 items-center">
                {isEditing ? (
                  <input
                    autoFocus
                    value={draft}
                    aria-label="Tab name"
                    maxLength={80}
                    onChange={(event) => setDraft(event.target.value)}
                    onFocus={(event) => event.target.select()}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      // The canvas also listens for keys; the field keeps its own.
                      event.stopPropagation();
                      if (event.key === "Enter") commitRename();
                      if (event.key === "Escape") {
                        isCancellingRef.current = true;
                        setEditingTabId(null);
                      }
                    }}
                    className="h-7 w-32 rounded-md border border-primary/50 bg-background px-2 text-[12px] font-semibold text-foreground outline-none"
                  />
                ) : (
                  <button
                    ref={(element) => {
                      if (element) buttonsRef.current.set(tab.id, element);
                      else buttonsRef.current.delete(tab.id);
                    }}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => switchTab(tab.id)}
                    onDoubleClick={() => startRename(tab.id, tab.name)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                    title={tab.name}
                    className={cn(
                      "flex h-7 max-w-40 items-center rounded-md px-2 text-[12px] font-semibold transition-colors",
                      isActive
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{tab.name}</span>
                  </button>
                )}
                {isActive && !isEditing ? (
                  <button
                    type="button"
                    aria-label={`Delete tab ${tab.name}`}
                    data-tip={blocker ?? "Delete tab"}
                    aria-disabled={blocker !== null}
                    onClick={() => {
                      if (!blocker) setDeletingTabId(tab.id);
                    }}
                    className={cn(
                      "ml-0.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                      blocker ? "cursor-not-allowed opacity-40 group-hover:opacity-40" : "hover:bg-foreground/10 hover:text-foreground",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Add tab"
          data-tip-detail="A new canvas for another set of explorations"
          onClick={() => void handleAdd()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <AlertDialog open={deletingTab !== null} onOpenChange={(open) => !open && setDeletingTabId(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingTab
                ? `Delete "${deletingTab.name}" and its ${pageCountOf(deletingTab.id)} ${pageCountOf(deletingTab.id) === 1 ? "page" : "pages"}?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The pages on this tab are deleted with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingTab) void deleteTab(projectId, deletingTab.id);
                setDeletingTabId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
