import { NextResponse } from "next/server";
import {
  getProjectDetailForUser,
  updateProjectForUser,
  deleteProjectForUser,
} from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const detail = await getProjectDetailForUser(projectId, sessionUser.id);

    if (!detail) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    logger.error("projects_get_failed", { error });
    return NextResponse.json({ error: "Failed to load project." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const parsed = await readJsonBodyWithLimit<{
      title?: unknown;
      status?: unknown;
    }>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.data;

    const updated = await updateProjectForUser({
      projectId,
      userId: sessionUser.id,
      title:
        typeof body.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : undefined,
      status: body.status === "active" || body.status === "archived" ? body.status : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ project: updated });
  } catch (error) {
    logger.error("projects_update_failed", { error });
    return NextResponse.json({ error: "Failed to update project." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const deleted = await deleteProjectForUser({
      projectId,
      userId: sessionUser.id,
    });

    if (!deleted) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("projects_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete project." }, { status: 500 });
  }
}
