/**
 * RFC 9728 protected resource metadata for `/api/mcp`, served at the root
 * well-known location. Clients that insert the resource path instead are
 * served by the sibling `api/mcp` route; both are one line around the shared
 * builder.
 */
import { buildProtectedResourceMetadata } from "@/lib/mcp/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  Response.json(buildProtectedResourceMetadata(new URL(request.url).origin));
