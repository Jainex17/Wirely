import { NextResponse } from "next/server";
import {
  deleteProjectPageForUser,
  updateProjectPageForUser,
} from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ projectId: string; pageId: string }>;
}

type UpdateProjectPageRequestBody = {
  title?: string | null;
  htmlContent?: string | null;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, pageId } = await context.params;
    const parsed = await readJsonBodyWithLimit<UpdateProjectPageRequestBody>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.data;

    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : undefined;
    const htmlContent = typeof body.htmlContent === "string" ? body.htmlContent : undefined;

    if (title === undefined && htmlContent === undefined) {
      return NextResponse.json({ error: "No updates provided." }, { status: 400 });
    }

    const page = await updateProjectPageForUser({
      projectId,
      pageId,
      userId: sessionUser.id,
      title,
      htmlContent,
    });

    if (!page) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    return NextResponse.json({ page });
  } catch (error) {
    logger.error("projects_pages_update_failed", { error });
    return NextResponse.json({ error: "Failed to update page." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, pageId } = await context.params;
    const result = await deleteProjectPageForUser({
      projectId,
      pageId,
      userId: sessionUser.id,
    });

    if (result.notFound) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    if (result.isLastPage) {
      return NextResponse.json(
        { error: "Cannot delete the only page in a project." },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, page: result.deleted });
  } catch (error) {
    logger.error("projects_pages_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete page." }, { status: 500 });
  }
}
