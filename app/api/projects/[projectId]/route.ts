import { NextResponse } from "next/server";
import {
  getProjectDetailForUser,
  updateProjectForUser,
} from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";

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
    console.error("[projects:get]", error);
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
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      status?: unknown;
    };

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
    console.error("[projects:update]", error);
    return NextResponse.json({ error: "Failed to update project." }, { status: 500 });
  }
}
