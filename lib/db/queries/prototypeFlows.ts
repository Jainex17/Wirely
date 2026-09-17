import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projectPages, projectPrototypeFlows, projects } from "@/lib/db/schema";

export interface PrototypeFlow {
  pageIds: string[];
  startPageId: string | null;
}

export const getPrototypeFlowForProject = async (
  projectId: string,
  userId: string,
): Promise<PrototypeFlow | null> => {
  const db = getDb();

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) return null;

  const pages = await db
    .select({ id: projectPages.id })
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId))
    .orderBy(asc(projectPages.sortOrder));
  const pageIdSet = new Set(pages.map((page) => page.id));

  const [flow] = await db
    .select()
    .from(projectPrototypeFlows)
    .where(eq(projectPrototypeFlows.projectId, projectId))
    .limit(1);

  if (!flow) {
    return {
      pageIds: pages.map((page) => page.id),
      startPageId: pages[0]?.id ?? null,
    };
  }

  const storedIds = (flow.pageIds ?? []).filter((pageId) => pageIdSet.has(pageId));
  const missingIds = pages
    .map((page) => page.id)
    .filter((pageId) => !storedIds.includes(pageId));
  const pageIds = [...storedIds, ...missingIds];

  const startPageId =
    flow.startPageId && pageIdSet.has(flow.startPageId)
      ? flow.startPageId
      : (pageIds[0] ?? null);

  return { pageIds, startPageId };
};

export const upsertPrototypeFlowForProject = async ({
  projectId,
  userId,
  pageIds,
  startPageId,
}: {
  projectId: string;
  userId: string;
  pageIds: string[];
  startPageId?: string | null;
}): Promise<PrototypeFlow | null> => {
  const db = getDb();

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) return null;

  const pages = await db
    .select({ id: projectPages.id })
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId));
  const pageIdSet = new Set(pages.map((page) => page.id));
  if (pageIds.some((pageId) => !pageIdSet.has(pageId))) return null;

  const resolvedStartPageId =
    startPageId && pageIdSet.has(startPageId) ? startPageId : (pageIds[0] ?? null);

  const [flow] = await db
    .insert(projectPrototypeFlows)
    .values({
      projectId,
      pageIds,
      startPageId: resolvedStartPageId,
    })
    .onConflictDoUpdate({
      target: projectPrototypeFlows.projectId,
      set: {
        pageIds,
        startPageId: resolvedStartPageId,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!flow) return null;
  return { pageIds: flow.pageIds, startPageId: flow.startPageId };
};
