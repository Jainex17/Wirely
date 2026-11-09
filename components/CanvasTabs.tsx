"use client";

import { File, Plus, Trash2 } from "lucide-react";
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
 * The list of the project's canvases at the top of the left panel, the way
 * Figma lists its pages above the layers. It shows even with one tab, so the
 * "+" is there to find. Double-click renames a tab in place. Each row has a
 * delete button on hover that asks first, since the tab's pages go with it,
 * and is off while the tab is the last one or holds every page. The list
 * scrolls past a few rows, so many tabs leave room for the page tree.
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

  // Up and down move between tabs and keep keyboard focus on the list.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    switchTab(next.id);
    buttonsRef.current.get(next.id)?.focus();
  };

  const deleteBlocker = (tabId: string) =>
    tabs.length <= 1
      ? "A project keeps at least one page."
      : pageCountOf(tabId) === pages.length
        ? "A project keeps at least one frame. Move a frame to another page first."
        : null;

  return (
    <>
      <div className="shrink-0 border-b border-sidebar-border pb-1.5">
        <div className="flex h-9 items-center gap-1 pl-4 pr-1.5">
          <span className="text-[11px] font-semibold text-foreground">Pages</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{tabs.length}</span>
          <button
            type="button"
            aria-label="Add page"
            data-tip-detail="A new canvas for another set of explorations"
            onClick={() => void handleAdd()}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          role="tablist"
          aria-label="Pages"
          aria-orientation="vertical"
          className="flex max-h-40 flex-col overflow-y-auto"
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const isEditing = tab.id === editingTabId;
            const blocker = deleteBlocker(tab.id);
            return (
              <div
                key={tab.id}
                className={cn(
                  "group ml-1.5 mr-1 flex h-7 shrink-0 items-center rounded-md transition-colors",
                  isActive
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={draft}
                    aria-label="Page name"
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
                    className="h-full min-w-0 flex-1 rounded-md bg-background px-2.5 text-xs text-foreground outline-none ring-1 ring-inset ring-primary/50"
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
                    title={`${tab.name} (double-click to rename)`}
                    className="flex h-full min-w-0 flex-1 cursor-default items-center gap-2 pl-2.5 pr-1 text-left text-xs"
                  >
                    <File className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{tab.name}</span>
                    <span className="ml-auto pl-1 tabular-nums text-muted-foreground group-hover:hidden">
                      {pageCountOf(tab.id)}
                    </span>
                  </button>
                )}
                {isEditing ? null : (
                  <button
                    type="button"
                    aria-label={`Delete page ${tab.name}`}
                    data-tip={blocker ?? "Delete page and its frames"}
                    aria-disabled={blocker !== null}
                    onClick={() => {
                      if (!blocker) setDeletingTabId(tab.id);
                    }}
                    className={cn(
                      "mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors group-hover:flex focus-visible:flex",
                      blocker ? "cursor-not-allowed opacity-40" : "hover:bg-foreground/10 hover:text-foreground",
                    )}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={deletingTab !== null} onOpenChange={(open) => !open && setDeletingTabId(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingTab
                ? `Delete "${deletingTab.name}" and its ${pageCountOf(deletingTab.id)} ${pageCountOf(deletingTab.id) === 1 ? "frame" : "frames"}?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The frames on this page are deleted with it. This cannot be undone.
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
