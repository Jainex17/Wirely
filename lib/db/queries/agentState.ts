import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import {
  projectAgentState,
  projectPageAgentBaselines,
  projectPages,
  projects,
} from "@/lib/db/schema";
import { applyDesignTokens, type DesignTokens } from "@/lib/designTokens";
import { logger } from "@/lib/logger";

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

/** Remembers the page and element the user picked. Callers check ownership. */
export const saveCanvasSelection = async (
  projectId: string,
  pageId: string,
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
        isNotNull(projectAgentState.selectedPageId),
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
