/**
 * The OAuth consent screen for the MCP connect flow.
 *
 * The browser side of "click Authorize and the client is connected". The GET
 * renders the consent card for a validated request; the POST in `route.ts`
 * burns in the code and hands the browser back to the client. Both go through
 * the same pure parser and the same exact-match redirect check, and any
 * failure renders an error screen here instead of redirecting — an invalid
 * request never gets to bounce anywhere.
 */
import Link from "next/link";

import { getRequestSessionUser } from "@/lib/auth/session";
import { getOauthClientById } from "@/lib/db/queries/oauth";
import { mcpResourceUri } from "@/lib/mcp/oauth/metadata";
import { requestIssuer } from "@/lib/mcp/oauth/origin";
import { parseAuthorizationRequest } from "@/lib/mcp/oauth/requests";
import { validateRedirectUri } from "@/lib/mcp/oauth/redirectUris";

export const dynamic = "force-dynamic";

const PROSE_CLASSES = "text-sm text-muted-foreground";

const renderError = (headline: string, detail: string) => (
  <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-base font-medium text-foreground">{headline}</h1>
      <p className={`mt-2 ${PROSE_CLASSES}`}>{detail}</p>
      <Link
        href="/"
        className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Back to Wirely
      </Link>
    </div>
  </main>
);

interface AuthorizePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuthorizePage({ searchParams }: AuthorizePageProps) {
  const user = await getRequestSessionUser();
  if (!user) {
    // The proxy matcher protects /mcp, so this is the signed-out edge only.
    return renderError(
      "Sign in required",
      "Sign in to Wirely, then open the connect link from your coding client again.",
    );
  }

  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) params.set(key, single);
  }

  const expectedResource = mcpResourceUri(await requestIssuer());

  const parsed = parseAuthorizationRequest(params, expectedResource);
  if (!parsed.ok) {
    return renderError(
      "This connect link is not valid",
      `${parsed.description} Ask your client to start the connection again.`,
    );
  }

  const client = await getOauthClientById(parsed.value.clientId);
  if (!client) {
    return renderError(
      "Unknown client",
      "The client that started this connection is not registered. Start the connection again from your client.",
    );
  }

  // Registration already shape-checked the URI; the exact-match here is the
  // rule that keeps a lookalike URL from collecting the code.
  if (
    validateRedirectUri(parsed.value.redirectUri) !== null ||
    !client.redirectUris.includes(parsed.value.redirectUri)
  ) {
    return renderError(
      "This connect link is not valid",
      "The redirect target does not match the one the client registered. Start the connection again.",
    );
  }

  let redirectHost: string;
  try {
    redirectHost = new URL(parsed.value.redirectUri).host;
  } catch {
    redirectHost = parsed.value.redirectUri;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <p className={`text-sm ${PROSE_CLASSES}`}>Connect to Wirely</p>
        <h1 className="mt-1 text-lg font-medium text-foreground">
          {client.name} wants to connect to your Wirely account
        </h1>
        <p className={`mt-3 ${PROSE_CLASSES}`}>
          Authorizing gives {client.name} access to your projects and pages through the Wirely
          MCP server, the same access as one of your personal tokens. It can create and edit
          designs on your canvas. It cannot see your provider keys.
        </p>
        <p className={`mt-2 text-xs text-muted-foreground`}>
          Signed in as {user.email ?? user.name ?? user.id}. After approving, you will be sent
          back to {redirectHost}.
        </p>

        <form action="/api/mcp/oauth/authorize" method="post" className="mt-5 flex items-center gap-2">
          <input type="hidden" name="client_id" value={parsed.value.clientId} />
          <input type="hidden" name="redirect_uri" value={parsed.value.redirectUri} />
          <input type="hidden" name="code_challenge" value={parsed.value.codeChallenge} />
          {parsed.value.state !== null ? (
            <input type="hidden" name="state" value={parsed.value.state} />
          ) : null}
          {parsed.value.resource !== null ? (
            <input type="hidden" name="resource" value={parsed.value.resource} />
          ) : null}
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.97]"
          >
            Authorize
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
          >
            Cancel
          </Link>
        </form>
      </div>
    </main>
  );
}
