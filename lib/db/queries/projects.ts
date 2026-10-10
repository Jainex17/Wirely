import { and, asc, desc, eq, getTableColumns, gt, ilike, inArray, sql, TransactionRollbackError } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getDesignTokens } from "@/lib/db/queries/agentState";
import { snapshotPageBeforeWrite } from "@/lib/db/queries/pageVersions";
import { applyDesignTokens } from "@/lib/designTokens";
import {
  conversationMessages,
  conversations,
  projectPages,
  projects,
  type ConversationRole,
  type ProjectStatus,
} from "@/lib/db/schema";
import type { PageDeviceType } from "@/lib/types";

/**
 * Creates a project with its conversation and one empty HTML page. Its design
 * canvas is made the first time it is used.
 */
export const createProject = async (userId: string, title: string) => {
  const db = getDb();

  const [project] = await db.insert(projects).values({ userId, title }).returning();

  if (!project) {
    throw new Error("Unable to create project.");
  }

  const [page] = await db
    .insert(projectPages)
    .values({
      projectId: project.id,
      title: "Page 1",
      sortOrder: 0,
    })
    .returning();

  const [conversation] = await db
    .insert(conversations)
    .values({ projectId: project.id })
    .returning();

  return { project, page, conversation };
};

// The home page renders recent projects as a flat list, so cap the query and
// report the true active total alongside it; the UI shows "50+" when capped.
export const PROJECT_HISTORY_LIMIT = 50;

// `titleQuery` narrows the list to titles containing it, so the MCP agent can
// find a project that has fallen past the limit.
export const listProjectsForUser = async (
  userId: string,
  limit: number = PROJECT_HISTORY_LIMIT,
  titleQuery?: string,
) => {
  const db = getDb();
  return db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      totalActive: sql<number>`(count(*) over ())::int`,
    })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.status, "active"),
        titleQuery ? ilike(projects.title, `%${titleQuery.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
      ),
    )
    .orderBy(desc(projects.updatedAt))
    .limit(limit);
};

/**
 * The first few pages of a project, for its home page thumbnail. One query
 * that checks ownership through the join, so a card costs one round trip.
 */
export const listProjectPreviewPages = async ({
  projectId,
  userId,
  limit,
}: {
  projectId: string;
  userId: string;
  limit: number;
}) => {
  const db = getDb();
  return db
    .select({
      id: projectPages.id,
      title: projectPages.title,
      deviceType: projectPages.deviceType,
      htmlContent: projectPages.htmlContent,
    })
    .from(projectPages)
    .innerJoin(projects, eq(projects.id, projectPages.projectId))
    .where(and(eq(projectPages.projectId, projectId), eq(projects.userId, userId)))
    .orderBy(asc(projectPages.sortOrder))
    .limit(limit);
};

export const getProjectForUser = async (projectId: string, userId: string) => {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  return project ?? null;
};

export const getProjectDetailForUser = async (projectId: string, userId: string) => {
  const db = getDb();

  // The editor waits on this before it can paint, so all three reads go out in
  // one round trip. Pages and messages of a project the user does not own are
  // read but dropped by the ownership check before anything is returned.
  const [project, pages, messages] = await Promise.all([
    getProjectForUser(projectId, userId),
    db
      .select()
      .from(projectPages)
      .where(eq(projectPages.projectId, projectId))
      .orderBy(asc(projectPages.sortOrder)),
    db
      .select({ ...getTableColumns(conversationMessages) })
      .from(conversationMessages)
      .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
      .where(eq(conversations.projectId, projectId))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(80),
  ]);
  if (!project) return null;

  return {
    project,
    pages,
    messages: [...messages].reverse(),
  };
};

// The prototype viewer needs page HTML and the project title only. The full
// project detail would drag the conversation history into a route that never
// reads it, so playback loads through this narrower path.
export const getProjectPlaybackForUser = async (projectId: string, userId: string) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;

  const pages = await db
    .select({
      id: projectPages.id,
      title: projectPages.title,
      htmlContent: projectPages.htmlContent,
      deviceType: projectPages.deviceType,
    })
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId))
    .orderBy(asc(projectPages.sortOrder));

  return { projectTitle: project.title, pages };
};

export const createProjectPage = async ({
  projectId,
  title,
  sortOrder,
  id,
}: {
  projectId: string;
  title: string;
  sortOrder: number;
  id?: string;
}) => {
  const db = getDb();

  const [page] = await db
    .insert(projectPages)
    .values({
      ...(id ? { id } : {}),
      projectId,
      title,
      sortOrder,
    })
    .returning();

  return page ?? null;
};

export const touchProjectUpdatedAt = async (projectId: string) => {
  const db = getDb();
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));
};

export const getProjectPageForUser = async ({
  projectId,
  pageId,
  userId,
}: {
  projectId: string;
  pageId: string;
  userId: string;
}) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;

  const [page] = await db
    .select()
    .from(projectPages)
    .where(and(eq(projectPages.projectId, projectId), eq(projectPages.id, pageId)))
    .limit(1);

  return page ?? null;
};

/** No ownership check. Only for callers that verified access another way, like a signed share link. */
export const getProjectPageById = async (pageId: string) => {
  const [page] = await getDb()
    .select()
    .from(projectPages)
    .where(eq(projectPages.id, pageId))
    .limit(1);
  return page ?? null;
};

export const listProjectPagesForUser = async ({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) return [];

  return db
    .select()
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId))
    .orderBy(asc(projectPages.sortOrder));
};

/**
 * What the open editor polls to pick up page writes it did not make, such as an
 * MCP agent editing the canvas. Only pages written after `since` carry their
 * HTML; every id comes back so the client can drop pages deleted elsewhere,
 * since a deleted row leaves nothing to find by timestamp.
 */
export const listProjectPageChangesForUser = async ({
  projectId,
  userId,
  since,
}: {
  projectId: string;
  userId: string;
  since: Date;
}) => {
  const db = getDb();
  // The editor polls this every few seconds, so the ownership check shares the
  // round trip with the reads and a failed check drops what they returned.
  const [project, idRows, changed] = await Promise.all([
    getProjectForUser(projectId, userId),
    db
      .select({ id: projectPages.id })
      .from(projectPages)
      .where(eq(projectPages.projectId, projectId))
      .orderBy(asc(projectPages.sortOrder)),
    db
      .select({
        id: projectPages.id,
        title: projectPages.title,
        htmlContent: projectPages.htmlContent,
        deviceType: projectPages.deviceType,
      })
      .from(projectPages)
      .where(and(eq(projectPages.projectId, projectId), gt(projectPages.updatedAt, since)))
      .orderBy(asc(projectPages.sortOrder)),
  ]);
  if (!project) return null;

  return { pageIds: idRows.map((row) => row.id), changed };
};

export const createProjectPageForUser = async ({
  projectId,
  userId,
  title,
  deviceType,
  htmlContent,
}: {
  projectId: string;
  userId: string;
  title: string;
  deviceType?: PageDeviceType;
  /** Pre-sanitized HTML. Callers must run `sanitizeIframeHtml` first. */
  htmlContent?: string;
}) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;

  const [lastPage] = await db
    .select({ sortOrder: projectPages.sortOrder })
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId))
    .orderBy(desc(projectPages.sortOrder))
    .limit(1);

  const [created] = await db
    .insert(projectPages)
    .values({
      projectId,
      title,
      sortOrder: (lastPage?.sortOrder ?? -1) + 1,
      htmlContent: applyDesignTokens(htmlContent ?? "", await getDesignTokens(projectId)),
      ...(deviceType ? { deviceType } : {}),
    })
    .returning();

  if (!created) return null;
  await touchProjectUpdatedAt(projectId);
  return created;
};

export const updateProjectPageForUser = async ({
  projectId,
  pageId,
  userId,
  title,
  htmlContent,
  deviceType,
  expectedHtmlContent,
  forceSnapshot,
}: {
  projectId: string;
  pageId: string;
  userId: string;
  title?: string;
  htmlContent?: string;
  deviceType?: PageDeviceType;
  /** Writes only if the page still holds this HTML, for compare-and-swap edits. */
  expectedHtmlContent?: string;
  /** Snapshot the current HTML even if a snapshot was just taken, so a restore can be undone. */
  forceSnapshot?: boolean;
}) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;

  // Every write carries the project's current tokens, whoever wrote the HTML.
  const html =
    htmlContent !== undefined
      ? applyDesignTokens(htmlContent, await getDesignTokens(projectId))
      : undefined;
  if (html !== undefined) {
    await snapshotPageBeforeWrite({ projectId, pageId, nextHtml: html, force: forceSnapshot });
  }

  const [updated] = await db
    .update(projectPages)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(html !== undefined ? { htmlContent: html } : {}),
      ...(deviceType !== undefined ? { deviceType } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectPages.projectId, projectId),
        eq(projectPages.id, pageId),
        expectedHtmlContent !== undefined
          ? eq(projectPages.htmlContent, expectedHtmlContent)
          : undefined,
      ),
    )
    .returning();

  if (!updated) return null;
  await touchProjectUpdatedAt(projectId);
  return updated;
};

/**
 * Writes several pages' HTML in one transaction, so an element moved from one
 * page to another is never saved on neither page or on both. Each page is
 * written only if it still holds `expectedHtmlContent`, the HTML the editor
 * built the edit from, so a move never overwrites an agent's newer write.
 * Returns the updated pages, "not_found" when the project or a page is not
 * the user's, or "conflict" when a page changed since.
 */
export const updateProjectPagesHtmlForUser = async ({
  projectId,
  userId,
  pages,
}: {
  projectId: string;
  userId: string;
  pages: Array<{ pageId: string; htmlContent: string; expectedHtmlContent: string }>;
}) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) return "not_found" as const;

  const tokens = await getDesignTokens(projectId);
  const writes = pages.map(({ pageId, htmlContent, expectedHtmlContent }) => ({
    pageId,
    html: applyDesignTokens(htmlContent, tokens),
    // The editor holds the HTML it last sent, while the row holds that HTML
    // with the tokens applied, so either one means nothing changed since.
    expected: [...new Set([expectedHtmlContent, applyDesignTokens(expectedHtmlContent, tokens)])],
  }));
  // Version snapshots sit outside the transaction. One left behind by a
  // failed write holds HTML the page still has, which is harmless.
  for (const { pageId, html } of writes) {
    await snapshotPageBeforeWrite({ projectId, pageId, nextHtml: html });
  }

  let failure = "not_found" as "not_found" | "conflict";
  const updated = await db.transaction(async (tx) => {
    const rows = [];
    for (const { pageId, html, expected } of writes) {
      const isPage = and(eq(projectPages.projectId, projectId), eq(projectPages.id, pageId));
      const [row] = await tx
        .update(projectPages)
        .set({ htmlContent: html, updatedAt: new Date() })
        .where(and(isPage, inArray(projectPages.htmlContent, expected)))
        .returning();
      if (!row) {
        const [existing] = await tx.select({ id: projectPages.id }).from(projectPages).where(isPage);
        failure = existing ? "conflict" : "not_found";
        tx.rollback();
      }
      rows.push(row);
    }
    return rows;
  }).catch((error: unknown) => {
    // Drizzle signals tx.rollback() by throwing.
    if (error instanceof TransactionRollbackError) return null;
    throw error;
  });

  if (!updated) return failure;
  await touchProjectUpdatedAt(projectId);
  return updated;
};

export const deleteProjectPageForUser = async ({
  projectId,
  pageId,
  userId,
}: {
  projectId: string;
  pageId: string;
  userId: string;
}) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return { deleted: null, notFound: true, isLastPage: false };
  }

  const [page] = await db
    .select({ id: projectPages.id })
    .from(projectPages)
    .where(and(eq(projectPages.projectId, projectId), eq(projectPages.id, pageId)))
    .limit(1);

  if (!page) {
    return { deleted: null, notFound: true, isLastPage: false };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId));

  if ((countRow?.count ?? 0) <= 1) {
    return { deleted: null, notFound: false, isLastPage: true };
  }

  const [deleted] = await db
    .delete(projectPages)
    .where(and(eq(projectPages.projectId, projectId), eq(projectPages.id, pageId)))
    .returning();

  if (!deleted) {
    return { deleted: null, notFound: true, isLastPage: false };
  }

  await touchProjectUpdatedAt(projectId);
  return { deleted, notFound: false, isLastPage: false };
};

export const updateProjectForUser = async ({
  projectId,
  userId,
  title,
  status,
}: {
  projectId: string;
  userId: string;
  title?: string;
  status?: ProjectStatus;
}) => {
  const db = getDb();

  const [updated] = await db
    .update(projects)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(status !== undefined ? { status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();

  return updated ?? null;
};

export const appendConversationMessage = async ({
  projectId,
  role,
  content,
  targetPageId,
  planningSummary,
  selectedModelName,
  plannerModelName,
  criticModelName,
}: {
  projectId: string;
  role: ConversationRole;
  content: string;
  targetPageId?: string;
  planningSummary?: string;
  selectedModelName?: string;
  plannerModelName?: string;
  criticModelName?: string;
}) => {
  const db = getDb();

  let [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({ projectId })
      .returning();
  }

  if (!conversation) {
    throw new Error("Unable to resolve conversation.");
  }

  const [message] = await db
    .insert(conversationMessages)
    .values({
      conversationId: conversation.id,
      role,
      content,
      ...(planningSummary ? { planningSummary } : {}),
      ...(selectedModelName ? { selectedModelName } : {}),
      ...(plannerModelName ? { plannerModelName } : {}),
      ...(criticModelName ? { criticModelName } : {}),
      ...(targetPageId ? { targetPageId } : {}),
    })
    .returning();

  await touchProjectUpdatedAt(projectId);
  return message;
};

/**
 * The most recent assistant reply in a project's conversation.
 *
 * A local-agent run writes its summary here rather than streaming it, so the
 * polling client reads it back instead of inventing its own wording. Returns
 * null before the first reply lands.
 */
export const getLatestAssistantMessage = async (projectId: string) => {
  const db = getDb();
  const [row] = await db
    .select({ content: conversationMessages.content })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
    .where(and(eq(conversations.projectId, projectId), eq(conversationMessages.role, "assistant")))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(1);

  return row?.content ?? null;
};

export const deleteProjectForUser = async ({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) => {
  const db = getDb();

  const [deleted] = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();

  return deleted ?? null;
};
