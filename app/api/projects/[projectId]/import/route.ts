import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { importUrlAsPage } from "@/lib/mcp/importUrlPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Loading the site in headless Chrome takes up to about 30 seconds.
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** The editor's Import dialog: loads a public URL and adds it as a page. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsed = await readJsonBodyWithLimit(request);
    if (!parsed.ok) return parsed.response;
    const { url, deviceType } = parsed.data;
    if (typeof url !== "string" || url.trim().length === 0 || url.length > 2_000) {
      return NextResponse.json({ error: "Enter a URL to import." }, { status: 400 });
    }

    const { projectId } = await context.params;
    const project = await getProjectForUser(projectId, sessionUser.id);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const imported = await importUrlAsPage({
      projectId: project.id,
      userId: sessionUser.id,
      url,
      deviceType: deviceType === "mobile" ? "mobile" : "desktop",
    });
    if (!imported.ok) {
      return NextResponse.json({ error: imported.error }, { status: 422 });
    }
    return NextResponse.json({ page: imported.page }, { status: 201 });
  } catch (error) {
    logger.error("projects_import_url_failed", { error });
    return NextResponse.json({ error: "Failed to import the page." }, { status: 500 });
  }
}
