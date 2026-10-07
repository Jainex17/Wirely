import { NextResponse } from "next/server";

import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectDocumentVersionForUser } from "@/lib/db/queries/projectDocuments";
import { listProjectPreviewPages } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/projectComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A home card shows at most this many pages of its canvas. */
const PREVIEW_PAGE_LIMIT = 3;

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * The first HTML pages of a project, or when none has content yet the URL of
 * its rendered design canvas, for the thumbnail on its home card. Home lists
 * titles only and each card fetches this once it scrolls into view, so the
 * home page never carries every project's HTML.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    if (!isUuid(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const pages = await listProjectPreviewPages({
      projectId,
      userId: sessionUser.id,
      limit: PREVIEW_PAGE_LIMIT,
    });
    if (pages.some((page) => page.htmlContent.trim())) return NextResponse.json({ pages }, { status: 200 });

    // A project used only on its Design tab shows a rendered PNG of that
    // canvas, addressed by version so the browser caches each one.
    const documentVersion = await getProjectDocumentVersionForUser(projectId, sessionUser.id);
    return NextResponse.json(
      documentVersion === null
        ? { pages }
        : { pages: [], thumbnailUrl: `/api/projects/${projectId}/document/thumbnail?v=${documentVersion}` },
      { status: 200 },
    );
  } catch (error) {
    logger.error("projects_preview_failed", { error });
    return NextResponse.json({ error: "Failed to load the preview." }, { status: 500 });
  }
}
