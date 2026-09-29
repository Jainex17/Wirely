import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { listPageVersions } from "@/lib/db/queries/pageVersions";
import { getProjectPageForUser } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; pageId: string }>;
}

/** Earlier versions of one page, newest first, for the history dialog. */
export async function GET(_request: Request, context: RouteContext) {
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

    return NextResponse.json(
      { versions: await listPageVersions(page.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("projects_page_versions_list_failed", { error });
    return NextResponse.json({ error: "Failed to load page history." }, { status: 500 });
  }
}
