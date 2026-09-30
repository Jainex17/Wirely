/** RFC 9728 metadata at the path-inserted location for the `/api/mcp` resource. */
import { buildProtectedResourceMetadata } from "@/lib/mcp/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  Response.json(buildProtectedResourceMetadata(new URL(request.url).origin));
