/**
 * An agent's request to lay out the canvas, sent with the arrange_canvas MCP
 * tool. The server stores the rows as asked. Pixel positions are worked out in
 * the editor by `layoutArrangement`, because only the editor knows how tall
 * each page frame measured.
 */
import { z } from "zod";

import { GROUP_FRAME_PADDING, PAGE_FRAME_TOP, PAGE_GAP } from "@/lib/canvasScene";
import type { PageGroup, PagePositionMap } from "@/lib/types";

const GROUP_NAME_MAX_CHARS = 80;

/** Pages that sit side by side. A named group gets a frame and a title on the canvas. */
export interface ArrangedGroup {
  name?: string;
  pageIds: string[];
}

/** Rows top to bottom, each holding groups left to right. */
export type ArrangementRows = ArrangedGroup[][];

export interface CanvasArrangement {
  rows: ArrangementRows;
  /** ISO time of the write, so the editor applies each arrangement once. */
  arrangedAt: string;
}

export const arrangementRowsSchema = z
  .array(
    z
      .array(
        z.object({
          name: z.string().trim().max(GROUP_NAME_MAX_CHARS).optional(),
          pageIds: z.array(z.string().trim().min(1)).min(1).max(100),
        }),
      )
      .min(1)
      .max(20),
  )
  .min(1)
  .max(20);

/** Reads an arrangement back from a saved layout, which any script on the origin could have written. */
export const readSavedArrangement = (value: unknown): CanvasArrangement | null => {
  const parsed = z.object({ rows: arrangementRowsSchema, arrangedAt: z.string() }).safeParse(value);
  return parsed.success ? parsed.data : null;
};

/**
 * The agent's groups for the pages there are now, each under the name the user
 * may have given it since. Ungrouping ends a live arrangement, so while one is
 * live every group on the canvas came from it.
 */
export const syncArrangedGroups = (current: PageGroup[], arranged: PageGroup[]) =>
  arranged.map((group) => ({
    ...group,
    name: current.find((candidate) => candidate.id === group.id)?.name ?? group.name,
  }));

const MAX_ARRANGEMENT_ROWS = 20;

/**
 * The project's stored rows after an agent arranges one tab. A project keeps
 * one arrangement, so the rows for every other tab stay, and only the pages
 * on this tab (`isOnTab`) take the new rows. Without this, arranging tab B
 * before the editor applied tab A's rows would lose tab A's layout. The
 * oldest rows go first if the total passes the row limit.
 */
export const mergeTabArrangement = (
  previous: ArrangementRows | null,
  next: ArrangementRows,
  isOnTab: (pageId: string) => boolean,
): ArrangementRows => {
  const kept = (previous ?? [])
    .map((row) =>
      row
        .map((group) => ({ ...group, pageIds: group.pageIds.filter((pageId) => !isOnTab(pageId)) }))
        .filter((group) => group.pageIds.length > 0),
    )
    .filter((row) => row.length > 0);
  return [...kept, ...next].slice(-MAX_ARRANGEMENT_ROWS);
};

/**
 * Checks the rows against the project's pages: every id must exist and appear
 * once. An arrangement lays out one tab, so `unlisted` counts only that tab's
 * pages, which is where the left-out ones go.
 */
export const checkArrangementPages = (
  rows: ArrangementRows,
  projectPageIds: string[],
  tabPageIds: string[] = projectPageIds,
) => {
  const known = new Set(projectPageIds);
  const seen = new Set<string>();
  const unknown: string[] = [];
  const repeated: string[] = [];
  for (const pageId of rows.flat().flatMap((group) => group.pageIds)) {
    if (!known.has(pageId)) unknown.push(pageId);
    else if (seen.has(pageId)) repeated.push(pageId);
    seen.add(pageId);
  }
  return { unknown, repeated, unlisted: tabPageIds.filter((pageId) => !seen.has(pageId)) };
};

// Scene pixels between the pages of neighbouring groups, and between rows.
// Each frame pads its pages, so 200px stays between frames side by side. Rows
// keep 480px between frames for the group name above each frame, which the
// canvas scales up to 10x as it zooms out, to about 380 scene pixels tall.
export const ARRANGEMENT_GROUP_GAP = GROUP_FRAME_PADDING * 2 + 200;
export const ARRANGEMENT_ROW_GAP = GROUP_FRAME_PADDING * 2 + 480;

/**
 * Places every page: groups left to right within a row, pages left to right
 * within a group, rows stacked by their tallest page. Pages the rows leave out
 * go in one more row at the bottom, without a group. Ids that are not in
 * `pageIds` are skipped, since a page can be deleted after the agent asked.
 */
export const layoutArrangement = (
  rows: ArrangementRows,
  pageIds: string[],
  sizeOf: (pageId: string) => { width: number; height: number },
): { pagePositions: PagePositionMap; pageGroups: PageGroup[] } => {
  const remaining = new Set(pageIds);
  const take = (ids: string[]) =>
    ids.filter((pageId) => {
      if (!remaining.has(pageId)) return false;
      remaining.delete(pageId);
      return true;
    });

  const placedRows = rows
    .map((row, rowIndex) =>
      row
        .map((group, groupIndex) => ({
          id: `arranged-${rowIndex}-${groupIndex}`,
          name: group.name?.trim() ?? "",
          pageIds: take(group.pageIds),
        }))
        .filter((group) => group.pageIds.length > 0),
    )
    .filter((row) => row.length > 0);
  const leftOver = take(pageIds);
  if (leftOver.length > 0) placedRows.push([{ id: "arranged-rest", name: "", pageIds: leftOver }]);

  const pagePositions: PagePositionMap = {};
  const pageGroups: PageGroup[] = [];
  let y = 0;
  for (const row of placedRows) {
    let x = 0;
    let rowHeight = 0;
    for (const group of row) {
      for (const pageId of group.pageIds) {
        const { width, height } = sizeOf(pageId);
        pagePositions[pageId] = { x, y };
        x += width + PAGE_GAP;
        rowHeight = Math.max(rowHeight, height);
      }
      x += ARRANGEMENT_GROUP_GAP - PAGE_GAP;
      if (group.name) pageGroups.push({ id: group.id, name: group.name, pageIds: group.pageIds });
    }
    // A page's height counts its design only, so add the title row above it.
    y += PAGE_FRAME_TOP + rowHeight + ARRANGEMENT_ROW_GAP;
  }
  return { pagePositions, pageGroups };
};
