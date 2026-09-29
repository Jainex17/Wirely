/**
 * The OAuth token exchange for the MCP connect flow.
 *
 * One grant, one client kind: authorization_code with PKCE, public clients.
 * The failure answers are deliberately indistinguishable (RFC 6749 section
 * 5.2) — an unknown, expired, replayed, or wrongly-bound code and a bad
 * verifier all return the same `invalid_grant`, so the endpoint cannot be
 * probed for which half of the flow a guess got right.
 */
import { createApiToken, hashApiToken } from "@/lib/auth/apiToken";
import { consumeAuthorizationCode, getOauthClientById } from "@/lib/db/queries/oauth";
import { MCP_SCOPE, mcpResourceUri } from "@/lib/mcp/oauth/metadata";
import { verifierMatchesChallenge } from "@/lib/mcp/oauth/pkce";
import { parseTokenRequest } from "@/lib/mcp/oauth/requests";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tokenError = (error: string, description: string, status = 400) =>
  Response.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } },
  );

const invalidGrant = () =>
  tokenError("invalid_grant", "The authorization code is invalid, expired, or already used.");

export async function POST(request: Request) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return tokenError("invalid_request", "The request body must be form-urlencoded.");
  }

  const parsed = parseTokenRequest(form);
  if (!parsed.ok) {
    return tokenError(parsed.error, parsed.description);
  }
  const tokenRequest = parsed.value;

  const client = await getOauthClientById(tokenRequest.clientId);
  if (!client) {
    return tokenError("invalid_client", "Unknown client.", 401);
  }

  const code = await consumeAuthorizationCode({
    codeHash: hashApiToken(tokenRequest.code),
    clientId: client.id,
  });
  if (!code) return invalidGrant();

  // The redirect URI is compared byte-for-byte against the one bound at
  // authorize time, which was already matched exactly against the registered
  // list — a lookalike URI cannot replay a code.
  if (tokenRequest.redirectUri !== code.redirectUri) return invalidGrant();

  if (tokenRequest.resource && tokenRequest.resource !== mcpResourceUri(new URL(request.url).origin)) {
    return tokenError("invalid_target", "The token was requested for a different resource.");
  }

  if (!verifierMatchesChallenge(tokenRequest.codeVerifier, code.codeChallenge)) {
    return invalidGrant();
  }

  const token = await createApiToken(code.userId, `OAuth: ${client.name}`, client.id);
  logger.info("mcp_oauth.token_issued", { clientId: client.id });

  return Response.json(
    {
      access_token: token.token,
      token_type: "Bearer",
      scope: MCP_SCOPE,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
