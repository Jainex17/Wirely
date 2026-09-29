import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { projectPages, projectPageVersions } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/** Writes this close to the last snapshot share it, so a burst of patches is one restore point. */
const SNAPSHOT_COALESCE_MS = 3 * 60_000;
const VERSIONS_KEPT_PER_PAGE = 20;

/**
 * Saves the page's current HTML as a version before `nextHtml` replaces it.
 * Skips an empty or unchanged page, and a page snapshotted moments ago unless
 * `force` is set. Never throws: a lost snapshot must not lose the write.
 */
export const snapshotPageBeforeWrite = async ({
  projectId,
  pageId,
  nextHtml,
  force = false,
}: {
  projectId: string;
  pageId: string;
  nextHtml: string;
  force?: boolean;
}) => {
  const db = getDb();
  try {
    const [current] = await db
      .select({
        title: projectPages.title,
        htmlContent: projectPages.htmlContent,
        lastVersionAt: sql<string | null>`(
          select max(${projectPageVersions.createdAt}) from ${projectPageVersions}
          where ${projectPageVersions.pageId} = ${projectPages.id}
        )`,
      })
      .from(projectPages)
      .where(and(eq(projectPages.projectId, projectId), eq(projectPages.id, pageId)))
      .limit(1);
    if (!current?.htmlContent.trim() || current.htmlContent === nextHtml) return;
    if (
      !force &&
      current.lastVersionAt &&
      Date.now() - new Date(current.lastVersionAt).getTime() < SNAPSHOT_COALESCE_MS
    ) {
      return;
    }

    await db
      .insert(projectPageVersions)
      .values({ pageId, title: current.title, htmlContent: current.htmlContent });
    await db.execute(sql`
      delete from project_page_versions
      where page_id = ${pageId} and id not in (
        select id from project_page_versions where page_id = ${pageId}
        order by created_at desc limit ${VERSIONS_KEPT_PER_PAGE}
      )
    `);
  } catch (error) {
    // Before the versions migration runs there is nowhere to save one.
    if (!isMissingRelationError(error)) logger.error("page_version_snapshot_failed", { error });
  }
};

/** Newest first, without HTML, for the history list. Callers check ownership. */
export const listPageVersions = async (pageId: string) => {
  try {
    return await getDb()
      .select({
        id: projectPageVersions.id,
        title: projectPageVersions.title,
        createdAt: projectPageVersions.createdAt,
      })
      .from(projectPageVersions)
      .where(eq(projectPageVersions.pageId, pageId))
      .orderBy(desc(projectPageVersions.createdAt));
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
};

/** One version of a page. Callers check ownership of `pageId`. */
export const getPageVersion = async (pageId: string, versionId: string) => {
  const [version] = await getDb()
    .select()
    .from(projectPageVersions)
    .where(and(eq(projectPageVersions.pageId, pageId), eq(projectPageVersions.id, versionId)))
    .limit(1);
  return version ?? null;
};
