import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import {
  projectPages,
  projectPageTabs,
  projectTabs,
  projects,
} from "@/lib/db/schema";
import {
  DEFAULT_TAB_NAME,
  findTabByName,
  nextTabName,
  resolvePageTabs,
  type PageTabAssignment,
  type ProjectTabRow,
} from "@/lib/projectTabs";

type Db = ReturnType<typeof getDb>;
export type Queryable = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// Not imported from queries/projects.ts, which imports this module for the
// tab of a new page. Two small statements beat a module cycle.
const ownsProject = async (db: Queryable, projectId: string, userId: string) => {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return row !== undefined;
};

/**
 * Holds the project's tab and arrangement writes one at a time until the
 * transaction ends. Without it, three parallel add_page calls naming one new
 * tab each find no such tab and make three, a double-clicked "+" makes two
 * "Tab 2"s, and two parallel arrange_canvas calls each drop the other's rows.
 */
export const lockProjectTabs = (db: Queryable, projectId: string) =>
  db.execute(sql`select pg_advisory_xact_lock(hashtext(${projectId}))`);

/**
 * Materializes the implicit first tab so a tab or assignment write has a row
 * to point at. It inserts only while the project has no tab rows at all, so
 * it never brings back a default tab the user deleted, and the id conflict
 * clause lets two racing calls both succeed.
 */
export const ensureDefaultTab = async (db: Queryable, projectId: string) => {
  await db.execute(sql`
    insert into ${projectTabs} (id, project_id, name, sort_order)
    select ${projectId}::uuid, ${projectId}::uuid, ${DEFAULT_TAB_NAME}, 0
    where not exists (select 1 from ${projectTabs} where project_id = ${projectId}::uuid)
    on conflict (id) do nothing
  `);
};

/** The raw tab rows and page assignments, both empty before the migration runs. */
export const readProjectTabRows = async (
  db: Queryable,
  projectId: string,
): Promise<{ tabs: ProjectTabRow[]; assignments: PageTabAssignment[] }> => {
  // One after the other: a transaction holds a single connection, and pg
  // deprecates sending it a query while another is running.
  try {
    const tabs = await db
      .select({
        id: projectTabs.id,
        name: projectTabs.name,
        sortOrder: projectTabs.sortOrder,
        createdAt: projectTabs.createdAt,
      })
      .from(projectTabs)
      .where(eq(projectTabs.projectId, projectId))
      .orderBy(asc(projectTabs.sortOrder), asc(projectTabs.createdAt));
    const assignments = await db
      .select({ pageId: projectPageTabs.pageId, tabId: projectPageTabs.tabId })
      .from(projectPageTabs)
      .innerJoin(projectPages, eq(projectPages.id, projectPageTabs.pageId))
      .where(eq(projectPages.projectId, projectId));
    return { tabs, assignments };
  } catch (error) {
    if (isMissingRelationError(error)) return { tabs: [], assignments: [] };
    throw error;
  }
};

/** The project's tabs and each page's tab. Callers check ownership. */
export const getProjectTabState = async (projectId: string, pageIds: string[]) =>
  resolvePageTabs({ projectId, ...(await readProjectTabRows(getDb(), projectId)), pageIds });

/**
 * The tab a new page goes on: the requested tab when it is the project's,
 * otherwise the tab an editor showed last, which is the canvas the user is
 * watching while an agent writes. Null means write no assignment, which puts
 * the page on the first tab, and is also the answer on a database without
 * the tables yet.
 */
export const resolveNewPageTab = async (projectId: string, requestedTabId?: string) => {
  const db = getDb();
  try {
    if (requestedTabId) {
      await ensureDefaultTab(db, projectId);
      const [tab] = await db
        .select({ id: projectTabs.id })
        .from(projectTabs)
        .where(and(eq(projectTabs.id, requestedTabId), eq(projectTabs.projectId, projectId)))
        .limit(1);
      if (tab) return tab.id;
    }
    const [opened] = await db
      .select({ id: projectTabs.id })
      .from(projectTabs)
      .where(and(eq(projectTabs.projectId, projectId), isNotNull(projectTabs.openedAt)))
      .orderBy(desc(projectTabs.openedAt))
      .limit(1);
    return opened?.id ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
};

/** Records that an editor is showing the tab, so agent pages land on it. */
export const markTabOpenedForUser = async ({
  projectId,
  userId,
  tabId,
}: {
  projectId: string;
  userId: string;
  tabId: string;
}) => {
  const db = getDb();
  if (!(await ownsProject(db, projectId, userId))) return null;

  return db.transaction(async (tx) => {
    await ensureDefaultTab(tx, projectId);
    const [tab] = await tx
      .update(projectTabs)
      .set({ openedAt: new Date() })
      .where(and(eq(projectTabs.id, tabId), eq(projectTabs.projectId, projectId)))
      .returning({ id: projectTabs.id });
    return tab ?? null;
  });
};

/** Writes a page's assignment. The tab must be known to belong to the project. */
export const writePageTab = async (db: Queryable, pageId: string, tabId: string) => {
  await db
    .insert(projectPageTabs)
    .values({ pageId, tabId })
    .onConflictDoUpdate({ target: projectPageTabs.pageId, set: { tabId } });
};

/**
 * Adds a tab. With `reuseByName`, a tab already called `name` (trimmed,
 * ignoring case) is returned instead, which is how an agent names the tab a
 * page goes on.
 */
export const createProjectTabForUser = async ({
  projectId,
  userId,
  name,
  reuseByName = false,
}: {
  projectId: string;
  userId: string;
  name?: string;
  reuseByName?: boolean;
}) => {
  const db = getDb();
  if (!(await ownsProject(db, projectId, userId))) return null;

  return db.transaction(async (tx) => {
    await lockProjectTabs(tx, projectId);
    await ensureDefaultTab(tx, projectId);
    const existing = await tx
      .select({ id: projectTabs.id, name: projectTabs.name, sortOrder: projectTabs.sortOrder })
      .from(projectTabs)
      .where(eq(projectTabs.projectId, projectId))
      .orderBy(asc(projectTabs.sortOrder), asc(projectTabs.createdAt));
    const match = reuseByName && name ? findTabByName(existing, name) : null;
    if (match) return { id: match.id, name: match.name };
    const [tab] = await tx
      .insert(projectTabs)
      .values({
        projectId,
        name: name ?? nextTabName(existing.map((row) => row.name)),
        sortOrder: existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
      })
      .returning({ id: projectTabs.id, name: projectTabs.name });
    return tab ?? null;
  });
};

/** Renaming the implicit tab writes its row first, so the name has somewhere to live. */
export const renameProjectTabForUser = async ({
  projectId,
  userId,
  tabId,
  name,
}: {
  projectId: string;
  userId: string;
  tabId: string;
  name: string;
}) => {
  const db = getDb();
  if (!(await ownsProject(db, projectId, userId))) return null;

  return db.transaction(async (tx) => {
    await ensureDefaultTab(tx, projectId);
    const [tab] = await tx
      .update(projectTabs)
      .set({ name })
      .where(and(eq(projectTabs.id, tabId), eq(projectTabs.projectId, projectId)))
      .returning({ id: projectTabs.id, name: projectTabs.name });
    return tab ?? null;
  });
};

export type DeleteTabResult =
  | { ok: true; deletedPageIds: string[] }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "refused"; message: string };

/**
 * Deletes a tab and every page on it. Refuses to leave the project without a
 * tab or without a page, since both are states the editor cannot show.
 */
export const deleteProjectTabForUser = async ({
  projectId,
  userId,
  tabId,
}: {
  projectId: string;
  userId: string;
  tabId: string;
}): Promise<DeleteTabResult> => {
  const db = getDb();
  if (!(await ownsProject(db, projectId, userId))) return { ok: false, reason: "not_found" };

  return db.transaction(async (tx) => {
    await lockProjectTabs(tx, projectId);
    await ensureDefaultTab(tx, projectId);
    const pageRows = await tx
      .select({ id: projectPages.id })
      .from(projectPages)
      .where(eq(projectPages.projectId, projectId));
    const pageIds = pageRows.map((row) => row.id);
    const { tabs, pageTabIds } = resolvePageTabs({
      projectId,
      ...(await readProjectTabRows(tx, projectId)),
      pageIds,
    });

    if (!tabs.some((tab) => tab.id === tabId)) return { ok: false, reason: "not_found" };
    if (tabs.length === 1) {
      return { ok: false, reason: "refused", message: "A project keeps at least one tab." };
    }
    const deletedPageIds = pageIds.filter((pageId) => pageTabIds[pageId] === tabId);
    if (pageIds.length > 0 && deletedPageIds.length === pageIds.length) {
      return {
        ok: false,
        reason: "refused",
        message: "A project keeps at least one page. Move a page to another tab first.",
      };
    }

    if (deletedPageIds.length > 0) {
      await tx.delete(projectPages).where(inArray(projectPages.id, deletedPageIds));
    }
    await tx.delete(projectTabs).where(eq(projectTabs.id, tabId));
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
    return { ok: true, deletedPageIds };
  });
};

/** Moves a page to a tab of the same project. "not_found" covers the project, the page, and the tab. */
export const movePageToTabForUser = async ({
  projectId,
  userId,
  pageId,
  tabId,
}: {
  projectId: string;
  userId: string;
  pageId: string;
  tabId: string;
}) => {
  const db = getDb();
  if (!(await ownsProject(db, projectId, userId))) return "not_found" as const;

  return db.transaction(async (tx) => {
    await lockProjectTabs(tx, projectId);
    await ensureDefaultTab(tx, projectId);
    const [page] = await tx
      .select({ id: projectPages.id })
      .from(projectPages)
      .where(and(eq(projectPages.id, pageId), eq(projectPages.projectId, projectId)))
      .limit(1);
    const [tab] = await tx
      .select({ id: projectTabs.id })
      .from(projectTabs)
      .where(and(eq(projectTabs.id, tabId), eq(projectTabs.projectId, projectId)))
      .limit(1);
    if (!page || !tab) return "not_found" as const;
    await writePageTab(tx, pageId, tabId);
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
    return "ok" as const;
  });
};
