/**
 * RFC 8414 authorization server metadata. Wirely is its own authorization
 * server for the MCP connect flow; the endpoints named here are the only ones
 * a client needs to run the flow.
 */
import { buildAuthorizationServerMetadata } from "@/lib/mcp/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  Response.json(buildAuthorizationServerMetadata(new URL(request.url).origin));
