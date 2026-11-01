import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import {
  projectAgentState,
  projectMemory,
  projectPageAgentBaselines,
  projectPages,
  projects,
} from "@/lib/db/schema";
import { applyDesignTokens, type DesignTokens } from "@/lib/designTokens";
import { logger } from "@/lib/logger";
import { type MemoryParseResult, mergeMemoryUpdate, type ProjectMemory } from "@/lib/projectMemory";

/** The project's tokens, or null when it has none. Callers check ownership. */
export const getDesignTokens = async (projectId: string): Promise<DesignTokens | null> => {
  try {
    const [row] = await getDb()
      .select({ designTokens: projectAgentState.designTokens })
      .from(projectAgentState)
      .where(eq(projectAgentState.projectId, projectId))
      .limit(1);
    return row?.designTokens ?? null;
  } catch (error) {
    // Before the migration runs, no project has tokens.
    if (isMissingRelationError(error)) return null;
    throw error;
  }
};

/**
 * Saves the tokens and rewrites every page's tokens block to match. Each
 * rewritten page gets a new `updatedAt`, so an open editor picks it up on its
 * next poll. Callers check ownership. Returns how many pages changed.
 */
export const setDesignTokens = async (projectId: string, tokens: DesignTokens) => {
  const db = getDb();
  const stored = Object.keys(tokens).length > 0 ? tokens : null;
  await db
    .insert(projectAgentState)
    .values({ projectId, designTokens: stored })
    .onConflictDoUpdate({ target: projectAgentState.projectId, set: { designTokens: stored } });

  const pages = await db
    .select({ id: projectPages.id, htmlContent: projectPages.htmlContent })
    .from(projectPages)
    .where(eq(projectPages.projectId, projectId));
  let changed = 0;
  for (const page of pages) {
    const html = applyDesignTokens(page.htmlContent, stored);
    if (html === page.htmlContent) continue;
    await db
      .update(projectPages)
      .set({ htmlContent: html, updatedAt: new Date() })
      .where(eq(projectPages.id, page.id));
    changed += 1;
  }
  return changed;
};

/** The project's context and rules, empty when it has none. Callers check ownership. */
export const getProjectMemory = async (projectId: string): Promise<ProjectMemory> => {
  try {
    const [row] = await getDb()
      .select({ context: projectMemory.context, rules: projectMemory.rules })
      .from(projectMemory)
      .where(eq(projectMemory.projectId, projectId))
      .limit(1);
    return row ?? { context: "", rules: [] };
  } catch (error) {
    // Before the migration runs, no project has memory.
    if (isMissingRelationError(error)) return { context: "", rules: [] };
    throw error;
  }
};

/** Attempts before a memory write gives up because others keep changing it. */
const MEMORY_WRITE_ATTEMPTS = 4;

/**
 * Applies a partial update (context, rules, or addRules) to the project's
 * memory. Each write only lands if the row still has the version it read, and
 * retries on a clash, so two saves at once both keep their changes. Callers
 * check ownership.
 */
export const updateProjectMemory = async (projectId: string, update: unknown): Promise<MemoryParseResult> => {
  const db = getDb();
  for (let attempt = 0; attempt < MEMORY_WRITE_ATTEMPTS; attempt += 1) {
    const [row] = await db
      .select({ context: projectMemory.context, rules: projectMemory.rules, version: projectMemory.version })
      .from(projectMemory)
      .where(eq(projectMemory.projectId, projectId))
      .limit(1);
    const merged = mergeMemoryUpdate(row ?? { context: "", rules: [] }, update);
    if (!merged.ok) return merged;

    const values = { context: merged.memory.context, rules: merged.memory.rules, updatedAt: new Date() };
    const written = row
      ? await db
          .update(projectMemory)
          .set({ ...values, version: row.version + 1 })
          .where(and(eq(projectMemory.projectId, projectId), eq(projectMemory.version, row.version)))
          .returning({ projectId: projectMemory.projectId })
      : await db
          .insert(projectMemory)
          .values({ projectId, ...values, version: 1 })
          .onConflictDoNothing()
          .returning({ projectId: projectMemory.projectId });
    if (written.length > 0) return merged;
  }
  return { ok: false, error: "The memory kept changing while saving. Try again." };
};

/**
 * Remembers the user's pick. An HTML project's is a page and maybe an element
 * in it; a design project's is the ids of its selected layers, comma joined,
 * with no page.
 */
export const saveCanvasSelection = async (
  projectId: string,
  pageId: string | null,
  nodeId: string | null,
) => {
  const selection = { selectedPageId: pageId, selectedNodeId: nodeId, selectedAt: new Date() };
  await getDb()
    .insert(projectAgentState)
    .values({ projectId, ...selection })
    .onConflictDoUpdate({ target: projectAgentState.projectId, set: selection });
};

/**
 * The user's most recent pick, in one project or across all of theirs. The
 * join on `projects` is the ownership check.
 */
export const getCanvasSelection = async (userId: string, projectId?: string) => {
  const [row] = await getDb()
    .select({
      projectId: projects.id,
      projectTitle: projects.title,
      pageId: projectAgentState.selectedPageId,
      nodeId: projectAgentState.selectedNodeId,
      selectedAt: projectAgentState.selectedAt,
    })
    .from(projectAgentState)
    .innerJoin(projects, eq(projects.id, projectAgentState.projectId))
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.status, "active"),
        // A design project's selection has node ids and no page.
        or(isNotNull(projectAgentState.selectedPageId), isNotNull(projectAgentState.selectedNodeId)),
        projectId ? eq(projects.id, projectId) : undefined,
      ),
    )
    .orderBy(desc(projectAgentState.selectedAt))
    .limit(1);
  return row ?? null;
};

/**
 * Records `html` as what the agent last wrote to the page. With `previousHtml`
 * it only moves a baseline that still equals it, so a patch after the user
 * edited by hand leaves those edits to report. Never throws: a lost baseline
 * must not fail the write. Callers check ownership.
 */
export const setAgentBaseline = async (pageId: string, html: string, previousHtml?: string) => {
  const db = getDb();
  try {
    if (previousHtml === undefined) {
      await db
        .insert(projectPageAgentBaselines)
        .values({ pageId, htmlContent: html })
        .onConflictDoUpdate({
          target: projectPageAgentBaselines.pageId,
          set: { htmlContent: html, updatedAt: new Date() },
        });
      return;
    }
    await db
      .update(projectPageAgentBaselines)
      .set({ htmlContent: html, updatedAt: new Date() })
      .where(
        and(
          eq(projectPageAgentBaselines.pageId, pageId),
          eq(projectPageAgentBaselines.htmlContent, previousHtml),
        ),
      );
  } catch (error) {
    if (!isMissingRelationError(error)) logger.error("agent_baseline_save_failed", { error });
  }
};

/** The HTML the agent last wrote to the page, or null when none is recorded. Callers check ownership. */
export const getAgentBaseline = async (pageId: string) => {
  try {
    const [row] = await getDb()
      .select({ htmlContent: projectPageAgentBaselines.htmlContent })
      .from(projectPageAgentBaselines)
      .where(eq(projectPageAgentBaselines.pageId, pageId))
      .limit(1);
    return row?.htmlContent ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
};
