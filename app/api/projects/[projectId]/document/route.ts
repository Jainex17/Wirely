import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import {
  getProjectDocumentForUser,
  saveProjectDocumentForUser,
} from "@/lib/db/queries/projectDocuments";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

// Under the 4.5 MB request cap of the free host. A document past it is
// carrying large embedded images.
const DOCUMENT_MAX_BYTES = 4_000_000;
const VERSION_HEADER = "x-document-version";

/** A design project's document as .fig bytes, with its version in a header. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { projectId } = await context.params;
    const document = await getProjectDocumentForUser(projectId, sessionUser.id);
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    return new Response(Buffer.from(document.data), {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        [VERSION_HEADER]: String(document.version),
      },
    });
  } catch (error) {
    logger.error("project_document_read_failed", { error });
    return NextResponse.json({ error: "Failed to read the document." }, { status: 500 });
  }
}

/**
 * Saves the document the editor holds. The body is .fig bytes and the version
 * header names the version the editor last loaded or saved. A save over a
 * newer version, an agent's write, is refused with 409 and the current
 * version, so the editor reloads instead of erasing it.
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const expectedVersion = Number.parseInt(request.headers.get(VERSION_HEADER) ?? "", 10);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ error: `Send the loaded version in ${VERSION_HEADER}.` }, { status: 400 });
    }
    const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ error: "The document is too large to save." }, { status: 413 });
    }
    const data = new Uint8Array(await request.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ error: "The document is empty or too large to save." }, { status: 413 });
    }

    const { projectId } = await context.params;
    const saved = await saveProjectDocumentForUser({
      projectId,
      userId: sessionUser.id,
      data,
      expectedVersion,
    });
    if (saved.status === "missing") return NextResponse.json({ error: "Document not found." }, { status: 404 });
    if (saved.status === "conflict") {
      return NextResponse.json({ error: "The document changed since it was loaded.", version: saved.version }, { status: 409 });
    }
    return NextResponse.json({ version: saved.version });
  } catch (error) {
    logger.error("project_document_save_failed", { error });
    return NextResponse.json({ error: "Failed to save the document." }, { status: 500 });
  }
}
