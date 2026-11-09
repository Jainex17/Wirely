/**
 * The editor's tab writes. A rename or a move changes the store first, so the
 * strip and the canvas answer at once, and is put back if the server refuses.
 * An add waits for the server, which picks the id. A delete waits too, since
 * the tab's pages go with it and are not worth restoring from memory.
 */
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";
import type { ProjectTab } from "@/lib/types";
import { useEditorStore } from "@/store/useEditorStore";

const request = async (url: string, init: RequestInit) => {
  const { beginSaving, endSaving } = useEditorStore.getState();
  beginSaving();
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; tab?: ProjectTab };
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed with status ${response.status}`);
    }
    return payload;
  } finally {
    endSaving();
  }
};

/** Adds a "Tab N" and shows it. Returns its id, or null when the add failed. */
export const createTab = async (projectId: string) => {
  try {
    const { tab } = await request(`/api/projects/${projectId}/tabs`, { method: "POST", body: "{}" });
    if (!tab) throw new Error("Tab creation response missing tab.");
    useEditorStore.getState().addTab(tab);
    return tab.id;
  } catch (error) {
    logger.error("tabs_create_failed", { projectId, error });
    toast.error("Could not add a tab. Please try again.");
    return null;
  }
};

export const renameTab = async (projectId: string, tabId: string, name: string) => {
  const previous = useEditorStore.getState().tabs.find((tab) => tab.id === tabId);
  if (!previous || previous.name === name) return;
  useEditorStore.getState().renameTab(tabId, name);
  try {
    await request(`/api/projects/${projectId}/tabs/${tabId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  } catch (error) {
    logger.error("tabs_rename_failed", { projectId, tabId, error });
    useEditorStore.getState().renameTab(tabId, previous.name);
    toast.error("Could not rename tab. Please try again.");
  }
};

export const deleteTab = async (projectId: string, tabId: string) => {
  try {
    await request(`/api/projects/${projectId}/tabs/${tabId}`, { method: "DELETE" });
    useEditorStore.getState().removeTab(tabId);
    toast.success("Tab deleted.");
  } catch (error) {
    logger.error("tabs_delete_failed", { projectId, tabId, error });
    toast.error(error instanceof Error ? error.message : "Could not delete tab.");
  }
};

export const movePageToTab = async (projectId: string, pageId: string, tabId: string) => {
  const page = useEditorStore.getState().pages.find((candidate) => candidate.id === pageId);
  if (!page || page.tabId === tabId) return;
  const from = page.tabId;
  useEditorStore.getState().movePageToTab(pageId, tabId);
  try {
    await request(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ tabId }),
    });
  } catch (error) {
    logger.error("pages_move_to_tab_failed", { projectId, pageId, tabId, error });
    useEditorStore.getState().movePageToTab(pageId, from);
    toast.error("Could not move the page. Please try again.");
  }
};
