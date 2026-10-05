import { headlessRenderNodes } from "@open-pencil/core/io/formats/raster";
import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { listScreens, screensPage } from "@/lib/design/document";
import { readProjectDocument } from "@/lib/design/projectDocument";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The home card's aspect, at twice its displayed size for sharp screens.
const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_HEIGHT = 400;

/**
 * A design project's canvas as a PNG for its home card, rendered on the
 * server with the design engine. The card asks with the document version in
 * the URL, so a rendered thumbnail never changes and the browser keeps it.
 */
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { projectId } = await context.params;
    const document = await readProjectDocument(projectId, sessionUser.id);
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const screens = listScreens(document.graph);
    if (screens.length === 0) return new Response(null, { status: 204 });

    // Every screen, scaled so the whole row fits the card.
    const left = Math.min(...screens.map((node) => node.x));
    const top = Math.min(...screens.map((node) => node.y));
    const width = Math.max(...screens.map((node) => node.x + node.width)) - left;
    const height = Math.max(...screens.map((node) => node.y + node.height)) - top;
    const scale = Math.min(THUMBNAIL_WIDTH / width, THUMBNAIL_HEIGHT / height, 1);
    const png = await headlessRenderNodes(
      document.graph,
      screensPage(document.graph).id,
      screens.map((node) => node.id),
      { format: "PNG", scale },
    );
    if (!png) return new Response(null, { status: 204 });
    return new Response(Buffer.from(png), {
      headers: { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" },
    });
  } catch (error) {
    logger.error("project_thumbnail_failed", { error });
    return NextResponse.json({ error: "Failed to render the thumbnail." }, { status: 500 });
  }
}
