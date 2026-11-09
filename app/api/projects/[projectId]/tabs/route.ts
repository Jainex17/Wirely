import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { createProjectTabForUser } from "@/lib/db/queries/tabs";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/projectComments";
import { parseTabName, TAB_NAME_MAX_CHARS } from "@/lib/projectTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** Adds a tab. Without a name it is "Tab N". */
export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    if (!isUuid(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const parsed = await readJsonBodyWithLimit<{ name?: unknown }>(request);
    if (!parsed.ok) return parsed.response;

    const name = parsed.data.name === undefined ? undefined : parseTabName(parsed.data.name);
    if (name === null) {
      return NextResponse.json(
        { error: `name must be 1 to ${TAB_NAME_MAX_CHARS} characters.` },
        { status: 400 },
      );
    }

    const tab = await createProjectTabForUser({ projectId, userId: sessionUser.id, name });
    if (!tab) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    return NextResponse.json({ tab }, { status: 201 });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ error: "Tabs are not set up on this server yet." }, { status: 503 });
    }
    logger.error("projects_tabs_create_failed", { error });
    return NextResponse.json({ error: "Failed to create tab." }, { status: 500 });
  }
}
