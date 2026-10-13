import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { listDocumentVersionsForUser } from "@/lib/db/queries/documentVersions";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Earlier states of the design document, newest first, for the Design tab's history dialog. */
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { projectId } = await context.params;
    const versions = await listDocumentVersionsForUser(projectId, sessionUser.id);
    if (!versions) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ versions }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logger.error("project_document_versions_list_failed", { error });
    return NextResponse.json({ error: "Failed to load the design history." }, { status: 500 });
  }
}
