import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  conversationMessages,
  conversations,
  projectPages,
  projects,
  type ConversationRole,
  type ProjectStatus,
} from "@/lib/db/schema";

export const createProject = async (userId: string, title: string) => {
  const db = getDb();

  const [project] = await db
    .insert(projects)
    .values({ userId, title })
    .returning();

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

export const listProjectsForUser = async (userId: string) => {
  const db = getDb();
  return db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, "active")))
    .orderBy(desc(projects.updatedAt));
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

  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;

  const [pages, conversationResult] = await Promise.all([
    db
      .select()
      .from(projectPages)
      .where(eq(projectPages.projectId, projectId))
      .orderBy(asc(projectPages.sortOrder)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId))
      .limit(1),
  ]);
  const [conversation] = conversationResult;

  const messages = conversation
    ? await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversation.id))
        .orderBy(desc(conversationMessages.createdAt))
        .limit(80)
    : [];

  return {
    project,
    pages,
    conversation,
    messages: [...messages].reverse(),
  };
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

export const createProjectPageForUser = async ({
  projectId,
  userId,
  title,
}: {
  projectId: string;
  userId: string;
  title: string;
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
      htmlContent: "",
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
}: {
  projectId: string;
  pageId: string;
  userId: string;
  title?: string;
  htmlContent?: string;
}) => {
  const db = getDb();
  const project = await getProjectForUser(projectId, userId);
  if (!project) return null;

  const [updated] = await db
    .update(projectPages)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(htmlContent !== undefined ? { htmlContent } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(projectPages.projectId, projectId), eq(projectPages.id, pageId)))
    .returning();

  if (!updated) return null;
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
}: {
  projectId: string;
  role: ConversationRole;
  content: string;
  targetPageId?: string;
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
      ...(targetPageId ? { targetPageId } : {}),
    })
    .returning();

  await touchProjectUpdatedAt(projectId);
  return message;
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
