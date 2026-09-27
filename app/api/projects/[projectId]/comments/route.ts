import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { listProjectComments } from "@/lib/db/queries/reviews";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** Review comments on the owner's project, for the pins on the canvas. */
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
      { comments: await listProjectComments(project.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Before the comments migration runs there is nothing to show.
    if (isMissingRelationError(error)) return NextResponse.json({ comments: [] });
    logger.error("projects_comments_list_failed", { error });
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }
}
