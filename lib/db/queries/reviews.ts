import { randomBytes } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  projectComments,
  projectPages,
  projects,
  projectShares,
  users,
} from "@/lib/db/schema";
import type { CommentInput, ProjectComment } from "@/lib/projectComments";

/** The owner's review link token, or null when the link is off. */
export const getProjectShareToken = async (projectId: string) => {
  const db = getDb();
  const [share] = await db
    .select({ token: projectShares.token })
    .from(projectShares)
    .where(eq(projectShares.projectId, projectId))
    .limit(1);
  return share?.token ?? null;
};

/** Turns the review link on. Calling it again keeps the existing token. */
export const enableProjectShare = async (projectId: string) => {
  const db = getDb();
  await db
    .insert(projectShares)
    .values({ projectId, token: randomBytes(18).toString("base64url") })
    .onConflictDoNothing({ target: projectShares.projectId });
  return getProjectShareToken(projectId);
};

/** Turns the review link off. Comments stay, and a new link gets a new token. */
export const disableProjectShare = async (projectId: string) => {
  const db = getDb();
  await db.delete(projectShares).where(eq(projectShares.projectId, projectId));
};

/** The project behind a review token, with its pages, or null for a dead link. */
export const getSharedProjectByToken = async (token: string) => {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id, title: projects.title, ownerUserId: projects.userId })
    .from(projectShares)
    .innerJoin(projects, eq(projects.id, projectShares.projectId))
    .where(and(eq(projectShares.token, token), eq(projects.status, "active")))
    .limit(1);
  if (!project) return null;

  const pages = await db
    .select({
      id: projectPages.id,
      title: projectPages.title,
      htmlContent: projectPages.htmlContent,
      deviceType: projectPages.deviceType,
    })
    .from(projectPages)
    .where(eq(projectPages.projectId, project.id))
    .orderBy(asc(projectPages.sortOrder));

  return { project, pages };
};

const commentColumns = {
  id: projectComments.id,
  pageId: projectComments.pageId,
  body: projectComments.body,
  x: projectComments.x,
  y: projectComments.y,
  authorUserId: projectComments.authorUserId,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
  resolvedAt: projectComments.resolvedAt,
  createdAt: projectComments.createdAt,
};

// Other reviewers see a name, never an email address.
const toProjectComment = (row: {
  id: string;
  pageId: string;
  body: string;
  x: number;
  y: number;
  authorUserId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}): ProjectComment => ({
  ...row,
  authorName: row.authorName?.trim() || "Wirely user",
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export const listProjectComments = async (projectId: string) => {
  const db = getDb();
  const rows = await db
    .select(commentColumns)
    .from(projectComments)
    .innerJoin(users, eq(users.id, projectComments.authorUserId))
    .where(eq(projectComments.projectId, projectId))
    .orderBy(asc(projectComments.createdAt));
  return rows.map(toProjectComment);
};

/**
 * Comments with their page's title and device type, for an MCP agent that
 * has no canvas to look at. The caller has already checked ownership.
 */
export const listProjectCommentsWithPages = async (projectId: string) => {
  const db = getDb();
  const rows = await db
    .select({
      ...commentColumns,
      pageTitle: projectPages.title,
      deviceType: projectPages.deviceType,
    })
    .from(projectComments)
    .innerJoin(users, eq(users.id, projectComments.authorUserId))
    .innerJoin(projectPages, eq(projectPages.id, projectComments.pageId))
    .where(eq(projectComments.projectId, projectId))
    .orderBy(asc(projectComments.createdAt));
  return rows.map(({ pageTitle, deviceType, ...row }) => ({
    ...toProjectComment(row),
    pageTitle,
    deviceType,
  }));
};

/** Adds a comment. Null when the page is not in the project. */
export const createProjectComment = async ({
  projectId,
  authorUserId,
  input,
}: {
  projectId: string;
  authorUserId: string;
  input: CommentInput;
}) => {
  const db = getDb();
  const [page] = await db
    .select({ id: projectPages.id })
    .from(projectPages)
    .where(and(eq(projectPages.id, input.pageId), eq(projectPages.projectId, projectId)))
    .limit(1);
  if (!page) return null;

  const [created] = await db
    .insert(projectComments)
    .values({ projectId, authorUserId, ...input })
    .returning({ id: projectComments.id });
  if (!created) return null;

  const [row] = await db
    .select(commentColumns)
    .from(projectComments)
    .innerJoin(users, eq(users.id, projectComments.authorUserId))
    .where(eq(projectComments.id, created.id))
    .limit(1);
  return row ? toProjectComment(row) : null;
};

/**
 * Deletes a comment its author wrote, or any comment when `isOwner`. Returns
 * whether a row went away.
 */
export const deleteProjectComment = async ({
  projectId,
  commentId,
  userId,
  isOwner,
}: {
  projectId: string;
  commentId: string;
  userId: string;
  isOwner: boolean;
}) => {
  const db = getDb();
  const deleted = await db
    .delete(projectComments)
    .where(
      and(
        eq(projectComments.id, commentId),
        eq(projectComments.projectId, projectId),
        isOwner ? sql`true` : eq(projectComments.authorUserId, userId),
      ),
    )
    .returning({ id: projectComments.id });
  return deleted.length > 0;
};

/** Resolves or reopens a comment. Only the project owner calls this. */
export const setProjectCommentResolved = async ({
  projectId,
  commentId,
  resolved,
}: {
  projectId: string;
  commentId: string;
  resolved: boolean;
}) => {
  const db = getDb();
  const updated = await db
    .update(projectComments)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(
      and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId)),
    )
    .returning({ id: projectComments.id });
  return updated.length > 0;
};
