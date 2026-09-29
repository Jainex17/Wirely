import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getPageVersion } from "@/lib/db/queries/pageVersions";
import { getProjectPageForUser, updateProjectPageForUser } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/projectComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; pageId: string; versionId: string }>;
}

const loadVersion = async (context: RouteContext) => {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return { response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }

  const { projectId, pageId, versionId } = await context.params;
  const page = await getProjectPageForUser({ projectId, pageId, userId: sessionUser.id });
  const version = page && isUuid(versionId) ? await getPageVersion(page.id, versionId) : null;
  if (!version) {
    return { response: NextResponse.json({ error: "Version not found." }, { status: 404 }) };
  }
  return { userId: sessionUser.id, projectId, version };
};

/** One version's HTML, for the history preview. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const loaded = await loadVersion(context);
    if ("response" in loaded) return loaded.response;
    return NextResponse.json(
      { html: loaded.version.htmlContent },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("projects_page_version_get_failed", { error });
    return NextResponse.json({ error: "Failed to load the version." }, { status: 500 });
  }
}

/**
 * Restores a version. The page's current HTML is snapshotted first, so a
 * restore shows up in history and can itself be undone.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const loaded = await loadVersion(context);
    if ("response" in loaded) return loaded.response;

    const page = await updateProjectPageForUser({
      projectId: loaded.projectId,
      pageId: loaded.version.pageId,
      userId: loaded.userId,
      htmlContent: loaded.version.htmlContent,
      forceSnapshot: true,
    });
    if (!page) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    return NextResponse.json({ html: page.htmlContent });
  } catch (error) {
    logger.error("projects_page_version_restore_failed", { error });
    return NextResponse.json({ error: "Failed to restore the version." }, { status: 500 });
  }
}
