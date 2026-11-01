import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { listPageActivity } from "@/lib/db/queries/activity";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * Page create and edit times for the editor's Activity tab. Comments are left
 * out because the editor already holds them.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const [project, activity] = await Promise.all([
      getProjectForUser(projectId, sessionUser.id),
      listPageActivity(projectId),
    ]);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json(activity, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("projects_activity_list_failed", { error });
    return NextResponse.json({ error: "Failed to load activity." }, { status: 500 });
  }
}
