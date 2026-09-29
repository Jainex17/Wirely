import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { listAgentActivity } from "@/lib/db/queries/agentActivity";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** MCP tool calls agents made on the owner's project, for the activity tab. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const project = await getProjectForUser(projectId, sessionUser.id);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json(
      { activity: await listAgentActivity(project.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Before the activity migration runs there is nothing to show.
    if (isMissingRelationError(error)) return NextResponse.json({ activity: [] });
    logger.error("projects_activity_list_failed", { error });
    return NextResponse.json({ error: "Failed to load activity." }, { status: 500 });
  }
}
