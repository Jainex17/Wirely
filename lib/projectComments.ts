/**
 * Input rules for review comments. Pure, so the API routes stay thin and the
 * rules are tested without a database.
 */
export const MAX_COMMENT_CHARS = 2_000;
// Matches the tallest frame the canvas renders, so a pin always lands on the page.
const MAX_COMMENT_COORDINATE = 20_000;

export interface CommentInput {
  pageId: string;
  body: string;
  x: number;
  y: number;
}

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from the URL, checked before they reach a uuid column. */
export const isUuid = (value: string) => UUID_FORMAT.test(value);

const isCoordinate = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_COMMENT_COORDINATE;

export const parseCommentInput = (
  value: unknown,
): { ok: true; input: CommentInput } | { ok: false; error: string } => {
  if (!value || typeof value !== "object") return { ok: false, error: "Expected a JSON object." };
  const record = value as Record<string, unknown>;
  if (typeof record.pageId !== "string" || !isUuid(record.pageId)) {
    return { ok: false, error: "pageId must be a page id." };
  }
  const body = typeof record.body === "string" ? record.body.trim() : "";
  if (!body) return { ok: false, error: "Write a comment first." };
  if (body.length > MAX_COMMENT_CHARS) {
    return { ok: false, error: `Comments are limited to ${MAX_COMMENT_CHARS} characters.` };
  }
  if (!isCoordinate(record.x) || !isCoordinate(record.y)) {
    return { ok: false, error: "x and y must be positions on the page." };
  }
  return {
    ok: true,
    input: { pageId: record.pageId, body, x: Math.round(record.x), y: Math.round(record.y) },
  };
};

/** A comment as the editor and the review page receive it. */
export interface ProjectComment {
  id: string;
  pageId: string;
  body: string;
  x: number;
  y: number;
  authorUserId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  resolvedAt: string | null;
  createdAt: string;
}
