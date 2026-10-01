import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectPageForUser } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";
import { renderPagePdf, renderPagePng, ScreenshotUnavailableError } from "@/lib/mcp/screenshot";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold start launches headless Chromium before the render.
export const maxDuration = 60;

// Each render drives a headless browser, which is the most expensive thing a
// click can do here. The limiter is in-memory and per instance, so this is a
// speed bump against a stuck button, not a quota.
const pngRateLimiter = createRateLimiter({
  windows: [
    { id: "minute", limit: 10, windowMs: 60_000 },
    { id: "hour", limit: 120, windowMs: 3_600_000 },
  ],
});

interface RouteContext {
  params: Promise<{ projectId: string; pageId: string }>;
}

/**
 * Renders one saved page to a PNG, or a PDF with `?format=pdf`, for the frame's "Copy image"
 * and download actions. The
 * browser cannot read the sandboxed preview, so the server renders the stored
 * HTML. It never accepts HTML from the request.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const rateLimit = pngRateLimiter.check(`${sessionUser.id}:page-png`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many image copies. Try again shortly." },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const { projectId, pageId } = await context.params;
    const page = await getProjectPageForUser({
      projectId,
      pageId,
      userId: sessionUser.id,
    });
    if (!page) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    if (!page.htmlContent.trim()) {
      return NextResponse.json({ error: "This page has no design yet." }, { status: 409 });
    }

    const params = new URL(request.url).searchParams;
    if (params.get("format") === "pdf") {
      const pdf = await renderPagePdf(page.htmlContent, page.deviceType);
      return new Response(Buffer.from(pdf), {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
      });
    }

    // 2x and 3x exports for retina screens. Anything else renders at 1x.
    const requestedScale = Number(params.get("scale"));
    const scale = requestedScale === 2 || requestedScale === 3 ? requestedScale : 1;
    const png = await renderPagePng(page.htmlContent, page.deviceType, false, scale);
    return new Response(Buffer.from(png.base64, "base64"), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ScreenshotUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    logger.error("projects_page_png_failed", { error });
    return NextResponse.json({ error: "Failed to render the page image." }, { status: 500 });
  }
}
