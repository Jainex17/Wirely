import { NextResponse } from "next/server";
import { createProjectPageForUser } from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { title?: unknown };
    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : "Untitled Page";

    const page = await createProjectPageForUser({
      projectId,
      userId: sessionUser.id,
      title,
    });

    if (!page) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    console.error("[projects:pages:create]", error);
    return NextResponse.json({ error: "Failed to create page." }, { status: 500 });
  }
}
