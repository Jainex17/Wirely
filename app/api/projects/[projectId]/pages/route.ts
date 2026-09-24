import { NextResponse } from "next/server";
import {
  createProjectPageForUser,
  listProjectPageChangesForUser,
  listProjectPagesForUser,
} from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

type CreateProjectPageRequestBody = {
  title?: string | null;
  deviceType?: string | null;
};

const isPageDeviceType = (value: unknown): value is "desktop" | "mobile" =>
  value === "desktop" || value === "mobile";

/**
 * Page timestamps come from both the app server clock and the database clock,
 * and serverless instances drift a little. Re-sending a page for a few extra
 * polls is harmless because the editor skips pages that did not change.
 */
const CHANGE_CURSOR_OVERLAP_MS = 5_000;

/**
 * Lists a project's pages.
 *
 * The editor hydrates from server props on load, but a local-agent run or an
 * MCP agent writes pages after that. Without `since` this returns every page.
 * With `since` it returns only pages written after that instant, every page id
 * so the editor can drop deleted ones, and the cursor for the next poll.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;

    const sinceParam = new URL(request.url).searchParams.get("since");
    if (sinceParam !== null) {
      const since = new Date(sinceParam);
      if (Number.isNaN(since.getTime())) {
        return NextResponse.json({ error: "since must be an ISO timestamp." }, { status: 400 });
      }
      const cursor = new Date().toISOString();
      const changes = await listProjectPageChangesForUser({
        projectId,
        userId: sessionUser.id,
        since: new Date(since.getTime() - CHANGE_CURSOR_OVERLAP_MS),
      });
      if (!changes) {
        return NextResponse.json({ error: "Project not found." }, { status: 404 });
      }
      return NextResponse.json({ ...changes, cursor }, { status: 200 });
    }

    const pages = await listProjectPagesForUser({
      projectId,
      userId: sessionUser.id,
    });

    return NextResponse.json({ pages }, { status: 200 });
  } catch (error) {
    logger.error("projects_pages_list_failed", { error });
    return NextResponse.json({ error: "Failed to list pages." }, { status: 500 });
  }
}

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
    const deviceType = isPageDeviceType(body.deviceType)
      ? body.deviceType
      : undefined;

    const page = await createProjectPageForUser({
      projectId,
      userId: sessionUser.id,
      title,
      deviceType,
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
