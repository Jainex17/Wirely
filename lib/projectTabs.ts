/**
 * How a project's tab rows and page assignments become the tabs the editor
 * shows. A project with no tab rows has one implicit tab whose id is the
 * project id, and a page with no assignment, or one pointing at a tab that is
 * gone, is on the first tab. So existing projects need no backfill and pages
 * written by code that knows nothing about tabs still land somewhere.
 */
import type { ProjectTab } from "@/lib/types";

export const TAB_NAME_MAX_CHARS = 80;
export const DEFAULT_TAB_NAME = "Page 1";

export interface ProjectTabRow {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
}

export interface PageTabAssignment {
  pageId: string;
  tabId: string;
}

export interface ProjectTabState {
  tabs: ProjectTab[];
  pageTabIds: Record<string, string>;
}

/** The trimmed name, or null when it is empty or over the limit. */
export const parseTabName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= TAB_NAME_MAX_CHARS ? name : null;
};

/** "Page N" for one more tab, skipping a number a tab already uses. The editor calls tabs pages. */
export const nextTabName = (existingNames: string[]) => {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  let number = existingNames.length + 1;
  while (taken.has(`page ${number}`)) number += 1;
  return `Page ${number}`;
};

/** The tab whose name matches after trimming, ignoring case, or null. */
export const findTabByName = (tabs: ProjectTab[], name: string) => {
  const wanted = name.trim().toLowerCase();
  return tabs.find((tab) => tab.name.trim().toLowerCase() === wanted) ?? null;
};

export const resolvePageTabs = ({
  projectId,
  tabs,
  assignments,
  pageIds,
}: {
  projectId: string;
  tabs: ProjectTabRow[];
  assignments: PageTabAssignment[];
  pageIds: string[];
}): ProjectTabState => {
  const ordered = [...tabs].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const resolvedTabs: ProjectTab[] =
    ordered.length > 0
      ? ordered.map(({ id, name }) => ({ id, name }))
      : [{ id: projectId, name: DEFAULT_TAB_NAME }];
  const known = new Set(resolvedTabs.map((tab) => tab.id));
  const assigned = new Map(assignments.map(({ pageId, tabId }) => [pageId, tabId]));
  const firstTabId = resolvedTabs[0].id;

  return {
    tabs: resolvedTabs,
    pageTabIds: Object.fromEntries(
      pageIds.map((pageId) => {
        const tabId = assigned.get(pageId);
        return [pageId, tabId !== undefined && known.has(tabId) ? tabId : firstTabId];
      }),
    ),
  };
};
