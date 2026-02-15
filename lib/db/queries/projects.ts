import { and, asc, desc, eq } from "drizzle-orm";
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

  const pages = await db
    .select()
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId))
    .orderBy(asc(projectPages.sortOrder));

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .limit(1);

  const messages = conversation
    ? await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversation.id))
        .orderBy(asc(conversationMessages.createdAt))
    : [];

  return {
    project,
    pages,
    conversation,
    messages,
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
}: {
  projectId: string;
  role: ConversationRole;
  content: string;
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
    })
    .returning();

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
