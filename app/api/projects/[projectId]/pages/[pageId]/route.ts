import { NextResponse } from "next/server";
import {
  deleteProjectPageForUser,
  updateProjectPageForUser,
} from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ projectId: string; pageId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, pageId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      htmlContent?: unknown;
    };

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
    console.error("[projects:pages:update]", error);
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
    console.error("[projects:pages:delete]", error);
    return NextResponse.json({ error: "Failed to delete page." }, { status: 500 });
  }
}
