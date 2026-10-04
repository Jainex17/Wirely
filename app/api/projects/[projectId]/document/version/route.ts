import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectDocumentVersionForUser } from "@/lib/db/queries/projectDocuments";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The document's version alone. The open editor polls it to notice an agent's
 * writes without downloading the document each time.
 */
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { projectId } = await context.params;
    const version = await getProjectDocumentVersionForUser(projectId, sessionUser.id);
    if (version === null) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    return NextResponse.json({ version }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logger.error("project_document_version_failed", { error });
    return NextResponse.json({ error: "Failed to read the document version." }, { status: 500 });
  }
}
