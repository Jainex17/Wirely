/**
 * The Authorize button's form target (POSTed from the consent page at
 * `/mcp/authorize`; a route handler rather than a server action so the
 * redirect to the client's callback stays a plain 303).
 *
 * Re-validates the posted fields exactly as the consent page did — the form
 * is attacker-writable, so nothing is trusted from it — then mints a
 * single-use code bound to the client, redirect URI, and PKCE challenge.
 *
 * An http(s) callback gets a straight 303; the client's own local server
 * shows "connected". A custom scheme (cursor://, vscode://, …) has no page to
 * land on, so this renders the connected screen itself and hands the code
 * over through a link the user clicks.
 */
import { getRequestSessionUser } from "@/lib/auth/session";
import { createAuthorizationCode, getOauthClientById } from "@/lib/db/queries/oauth";
import { mcpResourceUri } from "@/lib/mcp/oauth/metadata";
import { requestIssuer } from "@/lib/mcp/oauth/origin";
import { parseAuthorizationRequest } from "@/lib/mcp/oauth/requests";
import { validateRedirectUri } from "@/lib/mcp/oauth/redirectUris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderConnectedScreen = (clientName: string, callbackUrl: string) =>
  new Response(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Connected — Wirely</title></head>
<body style="font-family: system-ui, sans-serif; margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: #fafafa;">
  <div style="max-width: 24rem; padding: 1.5rem; border: 1px solid #e4e4e7; border-radius: 0.75rem; background: #fff; text-align: center;">
    <h1 style="font-size: 1.05rem; margin: 0; color: #18181b;">${escapeHtml(clientName)} is connected</h1>
    <p style="font-size: 0.875rem; color: #52525b; margin: 0.75rem 0 1.25rem;">Return to your editor to start using Wirely. You can close this tab.</p>
    <a href="${escapeHtml(callbackUrl)}" style="display: inline-block; padding: 0.5rem 1rem; border-radius: 0.375rem; background: #18181b; color: #fff; font-size: 0.875rem; text-decoration: none;">Return to ${escapeHtml(clientName)}</a>
  </div>
</body>
</html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );

const renderErrorScreen = (detail: string) =>
  new Response(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Not authorized — Wirely</title></head>
<body style="font-family: system-ui, sans-serif; margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: #fafafa;">
  <div style="max-width: 24rem; padding: 1.5rem; border: 1px solid #e4e4e7; border-radius: 0.75rem; background: #fff;">
    <h1 style="font-size: 1.05rem; margin: 0; color: #18181b;">The connection was not approved</h1>
    <p style="font-size: 0.875rem; color: #52525b; margin: 0.75rem 0 0;">${escapeHtml(detail)}</p>
  </div>
</body>
</html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );

/** Appends the OAuth response params to a callback that may carry its own query. */
const buildCallbackUrl = (
  redirectUri: string,
  params: { code: string; state: string | null; iss: string },
): string => {
  const target = new URL(redirectUri);
  target.searchParams.set("code", params.code);
  if (params.state) target.searchParams.set("state", params.state);
  target.searchParams.set("iss", params.iss);
  return target.toString();
};

export async function POST(request: Request) {
  const user = await getRequestSessionUser();
  if (!user) {
    return renderErrorScreen("Sign in to Wirely first, then start the connection again.");
  }

  const form = new URLSearchParams(await request.text());
  const issuer = await requestIssuer();

  const parsed = parseAuthorizationRequest(form, mcpResourceUri(issuer));
  if (!parsed.ok) return renderErrorScreen(parsed.description);

  const client = await getOauthClientById(parsed.value.clientId);
  if (!client) return renderErrorScreen("The client is not registered anymore. Start again.");

  if (
    validateRedirectUri(parsed.value.redirectUri) !== null ||
    !client.redirectUris.includes(parsed.value.redirectUri)
  ) {
    // Never redirect on a failed match; the error stays on Wirely.
    return renderErrorScreen("The redirect target does not match the registered client.");
  }

  const code = await createAuthorizationCode({
    clientId: client.id,
    userId: user.id,
    redirectUri: parsed.value.redirectUri,
    codeChallenge: parsed.value.codeChallenge,
  });

  const isHttpCallback = /^https?:$/i.test(new URL(parsed.value.redirectUri).protocol);
  if (isHttpCallback) {
    return new Response(null, {
      status: 303,
      headers: {
        location: buildCallbackUrl(parsed.value.redirectUri, {
          code,
          state: parsed.value.state,
          iss: issuer,
        }),
      },
    });
  }

  return renderConnectedScreen(
    client.name,
    buildCallbackUrl(parsed.value.redirectUri, { code, state: parsed.value.state, iss: issuer }),
  );
}
