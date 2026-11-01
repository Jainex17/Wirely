import type { ProjectComment } from "@/lib/projectComments";

/**
 * The project's recent history for the Activity tab, built from what the
 * database already keeps: page create times, page version snapshots, the
 * page's last write, and review comments. Nothing records who edited a page,
 * so an edit says only that the page changed.
 */
export type ActivityItem =
  | { id: string; kind: "page_added" | "page_edited"; pageId: string; at: string }
  | {
      id: string;
      kind: "comment_added" | "comment_resolved";
      pageId: string;
      at: string;
      commentId: string;
      authorName: string;
      body: string;
    };

/** What `GET /api/projects/[projectId]/activity` returns. */
export interface PageActivitySource {
  pages: Array<{ id: string; createdAt: string; updatedAt: string }>;
  /** When a write replaced each page's HTML, from its version snapshots. */
  edits: Array<{ pageId: string; at: string }>;
}

/**
 * Edits this close together are one burst of work, shown once at its latest
 * time. It matches the window the version snapshots already share.
 */
const EDIT_BURST_MS = 3 * 60_000;
/** A write this soon after a page appears is the agent finishing it, not an edit. */
const CREATE_SETTLE_MS = 30_000;
export const ACTIVITY_LIMIT = 100;

const time = (iso: string) => new Date(iso).getTime();

/** Newest first, capped at `ACTIVITY_LIMIT`. */
export const buildActivityFeed = ({
  pages,
  edits,
  comments,
}: PageActivitySource & { comments: ProjectComment[] }): ActivityItem[] => {
  const items: ActivityItem[] = [];
  const createdAtByPage = new Map(pages.map((page) => [page.id, time(page.createdAt)]));

  for (const page of pages) {
    items.push({ id: `added:${page.id}`, kind: "page_added", pageId: page.id, at: page.createdAt });
  }

  // The last write has no snapshot of its own, so the page's updatedAt joins
  // the snapshot times before they collapse into bursts.
  const editTimesByPage = new Map<string, number[]>();
  const addEdit = (pageId: string, at: string) => {
    const createdAt = createdAtByPage.get(pageId);
    if (createdAt === undefined || time(at) - createdAt < CREATE_SETTLE_MS) return;
    editTimesByPage.set(pageId, [...(editTimesByPage.get(pageId) ?? []), time(at)]);
  };
  for (const edit of edits) addEdit(edit.pageId, edit.at);
  for (const page of pages) addEdit(page.id, page.updatedAt);

  for (const [pageId, times] of editTimesByPage) {
    const sorted = [...new Set(times)].sort((a, b) => a - b);
    sorted.forEach((at, index) => {
      const next = sorted[index + 1];
      if (next !== undefined && next - at < EDIT_BURST_MS) return;
      items.push({ id: `edited:${pageId}:${at}`, kind: "page_edited", pageId, at: new Date(at).toISOString() });
    });
  }

  for (const comment of comments) {
    if (!createdAtByPage.has(comment.pageId)) continue;
    const base = {
      pageId: comment.pageId,
      commentId: comment.id,
      authorName: comment.authorName,
      body: comment.body,
    };
    items.push({ ...base, id: `comment:${comment.id}`, kind: "comment_added", at: comment.createdAt });
    if (comment.resolvedAt) {
      items.push({ ...base, id: `resolved:${comment.id}`, kind: "comment_resolved", at: comment.resolvedAt });
    }
  }

  return items.sort((a, b) => time(b.at) - time(a.at)).slice(0, ACTIVITY_LIMIT);
};
