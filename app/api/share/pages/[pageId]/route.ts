import { stripWirelyArtifacts } from "@/lib/agentPrompt";
import { getProjectPageById } from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";
import { verifyPageShare } from "@/lib/pageShare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ pageId: string }>;
}

// Generated HTML is hostile input. Served as text/plain with nosniff and a
// sandbox CSP, a browser that opens the link shows source and never runs it on
// Wirely's origin.
const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "Cache-Control": "private, no-store",
};

/**
 * The public end of a page share link. No session: the signature and expiry in
 * the query string are the access check. Always serves the page's current HTML.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { pageId } = await context.params;
    const query = new URL(request.url).searchParams;
    if (!verifyPageShare({ pageId, exp: query.get("exp"), sig: query.get("sig") })) {
      return new Response("This link is invalid or has expired.", {
        status: 403,
        headers: TEXT_HEADERS,
      });
    }

    const page = await getProjectPageById(pageId);
    if (!page?.htmlContent.trim()) {
      return new Response("This page no longer exists.", { status: 404, headers: TEXT_HEADERS });
    }

    return new Response(stripWirelyArtifacts(page.htmlContent), { headers: TEXT_HEADERS });
  } catch (error) {
    logger.error("share_page_failed", { error });
    return new Response("Failed to load the page.", { status: 500, headers: TEXT_HEADERS });
  }
}
