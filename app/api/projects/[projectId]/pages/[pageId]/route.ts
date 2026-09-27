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
  deviceType?: string | null;
};

// A page save carries the whole document, element ids included, which passes
// the shared 64 KB body limit on an ordinary generated page. Matches the MCP
// write cap of 500,000 characters plus JSON overhead.
const PAGE_UPDATE_MAX_BYTES = 600_000;

const isPageDeviceType = (value: unknown): value is "desktop" | "mobile" =>
  value === "desktop" || value === "mobile";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, pageId } = await context.params;
    const parsed = await readJsonBodyWithLimit<UpdateProjectPageRequestBody>(
      request,
      PAGE_UPDATE_MAX_BYTES,
    );
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.data;

    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : undefined;
    const htmlContent = typeof body.htmlContent === "string" ? body.htmlContent : undefined;
    const deviceType = isPageDeviceType(body.deviceType) ? body.deviceType : undefined;

    if (title === undefined && htmlContent === undefined && deviceType === undefined) {
      return NextResponse.json({ error: "No updates provided." }, { status: 400 });
    }

    const page = await updateProjectPageForUser({
      projectId,
      pageId,
      userId: sessionUser.id,
      title,
      htmlContent,
      deviceType,
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
