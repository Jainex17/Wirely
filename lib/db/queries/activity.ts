import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { projectPages, projectPageVersions } from "@/lib/db/schema";
import { ACTIVITY_LIMIT, type PageActivitySource } from "@/lib/projectActivity";

/** Page create and edit times for the Activity tab. Callers check ownership. */
export const listPageActivity = async (projectId: string): Promise<PageActivitySource> => {
  const db = getDb();
  const pages = await db
    .select({ id: projectPages.id, createdAt: projectPages.createdAt, updatedAt: projectPages.updatedAt })
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId));

  let edits: Array<{ pageId: string; at: Date }> = [];
  try {
    edits = await db
      .select({ pageId: projectPageVersions.pageId, at: projectPageVersions.createdAt })
      .from(projectPageVersions)
      .innerJoin(projectPages, eq(projectPages.id, projectPageVersions.pageId))
      .where(eq(projectPages.projectId, projectId))
      .orderBy(desc(projectPageVersions.createdAt))
      .limit(ACTIVITY_LIMIT);
  } catch (error) {
    // Before the versions migration runs, pages still have their own times.
    if (!isMissingRelationError(error)) throw error;
  }

  return {
    pages: pages.map((page) => ({
      id: page.id,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
    })),
    edits: edits.map((edit) => ({ pageId: edit.pageId, at: edit.at.toISOString() })),
  };
};
