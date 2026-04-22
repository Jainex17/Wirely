import { NextResponse } from "next/server";
import { createProjectPageForUser } from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

type CreateProjectPageRequestBody = {
  title?: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const parsed = await readJsonBodyWithLimit<CreateProjectPageRequestBody>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.data;
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
    logger.error("projects_pages_create_failed", { error });
    return NextResponse.json({ error: "Failed to create page." }, { status: 500 });
  }
}
