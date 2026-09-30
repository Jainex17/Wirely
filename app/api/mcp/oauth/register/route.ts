/**
 * RFC 7591 dynamic client registration for the MCP connect flow.
 *
 * Registration is deliberately unauthenticated — a client registers before
 * its user has any Wirely session — so this is the endpoint where junk
 * arrives. It is rate limited per IP, the body is small, and the only stored
 * values are a display name and redirect URIs that have passed
 * `validateRedirectUri`. No secret is issued: every client is a public
 * PKCE client.
 */
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { createOauthClient } from "@/lib/db/queries/oauth";
import { MCP_SCOPE } from "@/lib/mcp/oauth/metadata";
import { registrationBodySchema } from "@/lib/mcp/oauth/requests";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGISTER_BODY_MAX_BYTES = 16_000;

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
};

const registerLimiter = createRateLimiter();

export async function POST(request: Request) {
  const limit = registerLimiter.check(`mcp-oauth-register:${getClientIp(request)}`);
  if (!limit.allowed) {
    return Response.json(
      { error: "rate_limited", error_description: "Too many registrations. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await readJsonBodyWithLimit(request, REGISTER_BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;

  const body = registrationBodySchema.safeParse(parsed.data);
  if (!body.success) {
    const first = body.error.issues[0];
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description: `${first.path.join(".") || "body"}: ${first.message}`,
      },
      { status: 400 },
    );
  }

  const client = await createOauthClient(body.data.client_name, body.data.redirect_uris);
  logger.info("mcp_oauth.client_registered", { clientId: client.id });

  return Response.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: MCP_SCOPE,
    },
    { status: 201 },
  );
}
