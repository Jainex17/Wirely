import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectPageForUser } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";
import { renderPagePng, ScreenshotUnavailableError } from "@/lib/mcp/screenshot";
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
 * Renders one saved page to a PNG for the frame's "Copy image" button. The
 * browser cannot read the sandboxed preview, so the server renders the stored
 * HTML. It never accepts HTML from the request.
 */
export async function GET(_request: Request, context: RouteContext) {
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

    const png = await renderPagePng(
      page.htmlContent,
      page.deviceType === "mobile" ? "mobile" : "desktop",
    );
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
