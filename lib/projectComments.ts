/**
 * Input rules for review comments. Pure, so the API routes stay thin and the
 * rules are tested without a database.
 */
import { NODE_ID_FORMAT } from "@/lib/pageNodes";
import { isPageDeviceType } from "@/lib/types";

export const MAX_COMMENT_CHARS = 2_000;
// Matches the tallest frame the canvas renders, so a pin always lands on the page.
const MAX_COMMENT_COORDINATE = 20_000;

export interface CommentInput {
  pageId: string;
  /** The picked element, or null for a comment on the whole page. */
  nodeId: string | null;
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
  const nodeId = record.nodeId ?? null;
  if (nodeId !== null && (typeof nodeId !== "string" || !NODE_ID_FORMAT.test(nodeId))) {
    return { ok: false, error: "nodeId must be an element id or null." };
  }
  return {
    ok: true,
    input: {
      pageId: record.pageId,
      nodeId,
      body,
      x: Math.round(record.x),
      y: Math.round(record.y),
    },
  };
};

/** A comment as the editor and the review page receive it. */
export interface ProjectComment {
  id: string;
  pageId: string;
  nodeId: string | null;
  body: string;
  x: number;
  y: number;
  authorUserId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * Shapes review comments for an MCP agent: open ones only unless asked,
 * optionally one page, and without the author's user id or avatar, which an
 * agent has no use for. Pins are page pixels at the page's design width, so
 * the agent can match them against a get_page_png render.
 */
export const formatCommentsForAgent = (
  comments: Array<ProjectComment & { pageTitle: string; deviceType: string }>,
  { pageId, includeResolved = false }: { pageId?: string; includeResolved?: boolean },
) =>
  comments
    .filter((comment) => includeResolved || comment.resolvedAt === null)
    .filter((comment) => !pageId || comment.pageId === pageId)
    .map((comment) => ({
      id: comment.id,
      pageId: comment.pageId,
      pageTitle: comment.pageTitle,
      deviceType: isPageDeviceType(comment.deviceType) ? comment.deviceType : "desktop",
      // Pass as get_page's nodeId to read exactly the element the comment is about.
      ...(comment.nodeId ? { nodeId: comment.nodeId } : {}),
      author: comment.authorName,
      body: comment.body,
      pin: { x: comment.x, y: comment.y },
      resolved: comment.resolvedAt !== null,
      createdAt: comment.createdAt,
    }));
