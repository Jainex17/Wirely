import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { restoreProjectDocumentVersionForUser } from "@/lib/db/queries/projectDocuments";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/projectComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restores a snapshot as the design document. The current document goes into
 * history first, so the restore can be undone. Answers with the new version,
 * which open editors load like an agent's write.
 */
export async function POST(_request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { projectId, versionId } = await context.params;
    const restored = isUuid(versionId)
      ? await restoreProjectDocumentVersionForUser(projectId, sessionUser.id, versionId)
      : null;
    if (!restored || restored.status === "missing") {
      return NextResponse.json({ error: "Version not found." }, { status: 404 });
    }
    if (restored.status === "conflict") {
      return NextResponse.json({ error: "The design changed while restoring. Try again." }, { status: 409 });
    }
    return NextResponse.json({ version: restored.version });
  } catch (error) {
    logger.error("project_document_version_restore_failed", { error });
    return NextResponse.json({ error: "Failed to restore the version." }, { status: 500 });
  }
}
