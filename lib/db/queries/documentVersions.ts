import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { projectDocumentVersions, projects } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/** Saves this close to the last snapshot share it, so an editing session is one restore point. */
const SNAPSHOT_COALESCE_MS = 3 * 60_000;

// The database is a small Neon Postgres, and every snapshot is a full copy of
// the document. Local documents measure 50 to 100 KB, so ten of them take
// about 1 MB. A document with embedded images can reach the 4 MB save cap, so
// a project's history also stops at 2 MB: older snapshots go first, and the
// newest always stays, so one project's history never passes 4 MB.
export const DOCUMENT_VERSIONS_KEPT = 10;
export const DOCUMENT_HISTORY_MAX_BYTES = 2_000_000;

/**
 * The snapshots to delete from a project's history, given newest first: any
 * past the count, and any past the byte budget, but never the newest.
 */
export const documentVersionsToPrune = (versions: Array<{ id: string; byteSize: number }>) => {
  let total = 0;
  return versions
    .filter((version, index) => {
      total += version.byteSize;
      return index > 0 && (index >= DOCUMENT_VERSIONS_KEPT || total > DOCUMENT_HISTORY_MAX_BYTES);
    })
    .map((version) => version.id);
};

/**
 * Copies the stored document into history before a write replaces it. Skips
 * the empty document a project starts with (version 1), a document that is no
 * longer at `expectedVersion` (the write will be refused), and one snapshotted
 * moments ago unless `force` is set. Never throws: a lost snapshot must not
 * lose the save.
 */
export const snapshotDocumentBeforeWrite = async ({
  projectId,
  userId,
  expectedVersion,
  force = false,
}: {
  projectId: string;
  userId: string;
  expectedVersion: number;
  force?: boolean;
}) => {
  const db = getDb();
  const since = new Date(Date.now() - SNAPSHOT_COALESCE_MS);
  try {
    const inserted = await db.execute(sql`
      insert into project_document_versions (project_id, data)
      select d.project_id, d.data from project_documents d
      join projects p on p.id = d.project_id and p.user_id = ${userId}
      where d.project_id = ${projectId} and d.version = ${expectedVersion} and d.version > 1
      ${force ? sql`` : sql`and not exists (
        select 1 from project_document_versions v
        where v.project_id = ${projectId} and v.created_at > ${since}
      )`}
    `);
    if (!inserted.rowCount) return;

    const versions = await db
      .select({
        id: projectDocumentVersions.id,
        byteSize: sql<number>`octet_length(${projectDocumentVersions.data})`.mapWith(Number),
      })
      .from(projectDocumentVersions)
      .where(eq(projectDocumentVersions.projectId, projectId))
      .orderBy(desc(projectDocumentVersions.createdAt));
    const pruned = documentVersionsToPrune(versions);
    if (pruned.length > 0) {
      await db.delete(projectDocumentVersions).where(inArray(projectDocumentVersions.id, pruned));
    }
  } catch (error) {
    // Before the versions migration runs there is nowhere to save one.
    if (!isMissingRelationError(error)) logger.error("document_version_snapshot_failed", { error });
  }
};

/** A project's snapshots, newest first, without their bytes, or null when the project is not the user's. */
export const listDocumentVersionsForUser = async (projectId: string, userId: string) => {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) return null;
  try {
    return await db
      .select({ id: projectDocumentVersions.id, createdAt: projectDocumentVersions.createdAt })
      .from(projectDocumentVersions)
      .where(eq(projectDocumentVersions.projectId, projectId))
      .orderBy(desc(projectDocumentVersions.createdAt));
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
};

/** One snapshot's bytes, or null when it is not in this project of the user's. */
export const getDocumentVersionForUser = async (projectId: string, userId: string, versionId: string) => {
  const [version] = await getDb()
    .select({ data: projectDocumentVersions.data })
    .from(projectDocumentVersions)
    .innerJoin(projects, eq(projects.id, projectDocumentVersions.projectId))
    .where(
      and(
        eq(projectDocumentVersions.id, versionId),
        eq(projectDocumentVersions.projectId, projectId),
        eq(projects.userId, userId),
      ),
    )
    .limit(1);
  return version ? new Uint8Array(version.data) : null;
};
