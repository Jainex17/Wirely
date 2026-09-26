import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectPageForUser } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";
import { createPageSharePath } from "@/lib/pageShare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; pageId: string }>;
}

/** Mints a signed read-only link to one saved page, for the "Copy for agent" prompt. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, pageId } = await context.params;
    const page = await getProjectPageForUser({ projectId, pageId, userId: sessionUser.id });
    if (!page) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    if (!page.htmlContent.trim()) {
      return NextResponse.json({ error: "This page has no design yet." }, { status: 409 });
    }

    const { path, expiresAt } = createPageSharePath(page.id);
    return NextResponse.json(
      { url: `${new URL(request.url).origin}${path}`, expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("projects_page_share_failed", { error });
    return NextResponse.json({ error: "Failed to create a share link." }, { status: 500 });
  }
}
