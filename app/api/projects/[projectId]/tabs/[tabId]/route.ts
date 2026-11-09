import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { deleteProjectTabForUser, renameProjectTabForUser } from "@/lib/db/queries/tabs";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/projectComments";
import { parseTabName, TAB_NAME_MAX_CHARS } from "@/lib/projectTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; tabId: string }>;
}

const tabsUnavailable = () =>
  NextResponse.json({ error: "Tabs are not set up on this server yet." }, { status: 503 });

/** Renames a tab. The implicit first tab gets its row on its first rename. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, tabId } = await context.params;
    if (!isUuid(projectId) || !isUuid(tabId)) {
      return NextResponse.json({ error: "Tab not found." }, { status: 404 });
    }
    const parsed = await readJsonBodyWithLimit<{ name?: unknown }>(request);
    if (!parsed.ok) return parsed.response;

    const name = parseTabName(parsed.data.name);
    if (name === null) {
      return NextResponse.json(
        { error: `name must be 1 to ${TAB_NAME_MAX_CHARS} characters.` },
        { status: 400 },
      );
    }

    const tab = await renameProjectTabForUser({ projectId, userId: sessionUser.id, tabId, name });
    if (!tab) {
      return NextResponse.json({ error: "Tab not found." }, { status: 404 });
    }
    return NextResponse.json({ tab });
  } catch (error) {
    if (isMissingRelationError(error)) return tabsUnavailable();
    logger.error("projects_tabs_rename_failed", { error });
    return NextResponse.json({ error: "Failed to rename tab." }, { status: 500 });
  }
}

/**
 * Deletes a tab and the pages on it. Answers 409 when the tab is the last one
 * or holds every page, since the project keeps at least one of each.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, tabId } = await context.params;
    if (!isUuid(projectId) || !isUuid(tabId)) {
      return NextResponse.json({ error: "Tab not found." }, { status: 404 });
    }

    const result = await deleteProjectTabForUser({ projectId, userId: sessionUser.id, tabId });
    if (!result.ok) {
      return result.reason === "not_found"
        ? NextResponse.json({ error: "Tab not found." }, { status: 404 })
        : NextResponse.json({ error: result.message }, { status: 409 });
    }
    return NextResponse.json({ success: true, deletedPageIds: result.deletedPageIds });
  } catch (error) {
    if (isMissingRelationError(error)) return tabsUnavailable();
    logger.error("projects_tabs_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete tab." }, { status: 500 });
  }
}
