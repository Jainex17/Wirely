import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projectDocuments, projects } from "@/lib/db/schema";

/** A design project's document and its version, or null when the project is not the user's or not a design project. */
export const getProjectDocumentForUser = async (projectId: string, userId: string) => {
  const db = getDb();
  const [row] = await db
    .select({ data: projectDocuments.data, version: projectDocuments.version })
    .from(projectDocuments)
    .innerJoin(projects, eq(projects.id, projectDocuments.projectId))
    .where(and(eq(projectDocuments.projectId, projectId), eq(projects.userId, userId)))
    .limit(1);
  return row ? { data: new Uint8Array(row.data), version: row.version } : null;
};

/** Only the version, for the editor's poll that notices an agent's writes. */
export const getProjectDocumentVersionForUser = async (projectId: string, userId: string) => {
  const db = getDb();
  const [row] = await db
    .select({ version: projectDocuments.version })
    .from(projectDocuments)
    .innerJoin(projects, eq(projects.id, projectDocuments.projectId))
    .where(and(eq(projectDocuments.projectId, projectId), eq(projects.userId, userId)))
    .limit(1);
  return row?.version ?? null;
};

export type SaveDocumentResult =
  | { status: "saved"; version: number }
  | { status: "conflict"; version: number }
  | { status: "missing" };

/**
 * Saves the document only if it is still at `expectedVersion`, so two writers
 * that read the same version cannot both save: the second gets "conflict" and
 * the current version, reloads, and tries again.
 */
export const saveProjectDocumentForUser = async ({
  projectId,
  userId,
  data,
  expectedVersion,
}: {
  projectId: string;
  userId: string;
  data: Uint8Array;
  expectedVersion: number;
}): Promise<SaveDocumentResult> => {
  const db = getDb();
  const [saved] = await db
    .update(projectDocuments)
    .set({ data: Buffer.from(data), version: sql`${projectDocuments.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.version, expectedVersion),
        sql`exists (select 1 from ${projects} where ${projects.id} = ${projectId} and ${projects.userId} = ${userId})`,
      ),
    )
    .returning({ version: projectDocuments.version });
  if (saved) {
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
    return { status: "saved", version: saved.version };
  }
  const current = await getProjectDocumentVersionForUser(projectId, userId);
  return current === null ? { status: "missing" } : { status: "conflict", version: current };
};
