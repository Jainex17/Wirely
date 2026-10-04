import { NextResponse } from "next/server";
import { isPageDeviceType } from "@/lib/types";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { prepareArtboardHtml } from "@/lib/vectorArtboard";
import {
  createProjectPageForUser,
  listProjectPageChangesForUser,
  listProjectPagesForUser,
  updateProjectPagesHtmlForUser,
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
  htmlContent?: string | null;
};

type UpdateProjectPagesRequestBody = {
  pages?: Array<{ id?: unknown; htmlContent?: unknown }> | null;
};

// An edit that touches several pages, today an element moved between two.
const MAX_PAGES_PER_UPDATE = 2;

// Matches the page update route, so a page can be created with any HTML it
// could later be saved with.
const PAGE_CREATE_MAX_BYTES = 600_000;

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
    const parsed = await readJsonBodyWithLimit<CreateProjectPageRequestBody>(
      request,
      PAGE_CREATE_MAX_BYTES,
    );
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
    // Sent with the create so a page never exists on the server without the
    // content it was created for. Cleaned the same way the MCP add_page does.
    const htmlContent =
      typeof body.htmlContent === "string"
        ? sanitizeIframeHtml(
            deviceType === "vector" ? prepareArtboardHtml(body.htmlContent) : body.htmlContent,
          )
        : undefined;

    const page = await createProjectPageForUser({
      projectId,
      userId: sessionUser.id,
      title,
      deviceType,
      htmlContent,
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

/**
 * Saves several pages' HTML at once, all or nothing. The canvas uses it when
 * an element moves from one page to another, so a failed save never leaves the
 * element on neither page.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const parsed = await readJsonBodyWithLimit<UpdateProjectPagesRequestBody>(
      request,
      PAGE_CREATE_MAX_BYTES * MAX_PAGES_PER_UPDATE,
    );
    if (!parsed.ok) {
      return parsed.response;
    }
    const entries = Array.isArray(parsed.data.pages) ? parsed.data.pages : [];
    const pages = entries.flatMap((entry) =>
      typeof entry?.id === "string" && typeof entry.htmlContent === "string"
        ? [{ pageId: entry.id, htmlContent: entry.htmlContent }]
        : [],
    );
    const isUnique = new Set(pages.map((page) => page.pageId)).size === pages.length;
    if (
      pages.length === 0 ||
      pages.length !== entries.length ||
      pages.length > MAX_PAGES_PER_UPDATE ||
      !isUnique
    ) {
      return NextResponse.json(
        { error: `Send 1 to ${MAX_PAGES_PER_UPDATE} distinct pages, each with an id and htmlContent.` },
        { status: 400 },
      );
    }

    const updated = await updateProjectPagesHtmlForUser({
      projectId,
      userId: sessionUser.id,
      pages,
    });
    if (!updated) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    return NextResponse.json({ pages: updated });
  } catch (error) {
    logger.error("projects_pages_batch_update_failed", { error });
    return NextResponse.json({ error: "Failed to update pages." }, { status: 500 });
  }
}
