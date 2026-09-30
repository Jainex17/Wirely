/**
 * Pure parsers for the request shapes of the connect flow: client
 * registration, the browser authorization request, and the token exchange. Every field an attacker can
 * type is checked here, once, so the authorize page and the token route stay
 * thin and cannot drift apart on what they accept.
 */

import { z } from "zod";

import { isCodeChallenge } from "./pkce";
import { validateRedirectUri } from "./redirectUris";

export type OAuthErrorCode = "invalid_request" | "unsupported_grant_type" | "invalid_target";

export type ParsedRequest<T> =
  | { ok: true; value: T }
  | { ok: false; error: OAuthErrorCode; description: string };

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  /** RFC 8707 resource indicator, validated against the canonical resource URI. */
  resource: string | null;
}

const MAX_PARAM_CHARS = 500;

const readParam = (params: URLSearchParams, name: string): string | null => {
  const value = params.get(name)?.trim() ?? "";
  return value && value.length <= MAX_PARAM_CHARS ? value : null;
};

/**
 * Parses the `/mcp/authorize` query. `expectedResource` is the canonical
 * `/api/mcp` URI for the origin serving the request; a `resource` that names
 * any other target is refused rather than silently re-bound to Wirely.
 */
export const parseAuthorizationRequest = (
  params: URLSearchParams,
  expectedResource: string,
): ParsedRequest<AuthorizationRequest> => {
  if (params.get("response_type") !== "code") {
    return { ok: false, error: "invalid_request", description: "response_type must be \"code\"." };
  }

  const clientId = readParam(params, "client_id");
  if (!clientId) {
    return { ok: false, error: "invalid_request", description: "client_id is required." };
  }

  const redirectUri = readParam(params, "redirect_uri");
  if (!redirectUri) {
    return { ok: false, error: "invalid_request", description: "redirect_uri is required." };
  }

  const method = params.get("code_challenge_method");
  if (method !== "S256") {
    return {
      ok: false,
      error: "invalid_request",
      description: "PKCE with code_challenge_method=S256 is required.",
    };
  }

  const codeChallenge = readParam(params, "code_challenge");
  if (!codeChallenge || !isCodeChallenge(codeChallenge)) {
    return {
      ok: false,
      error: "invalid_request",
      description: "code_challenge must be 43-128 base64url characters.",
    };
  }

  const resource = readParam(params, "resource");
  if (resource && resource !== expectedResource) {
    return {
      ok: false,
      error: "invalid_target",
      description: "This authorization request does not name the Wirely MCP server.",
    };
  }

  return {
    ok: true,
    value: {
      clientId,
      redirectUri,
      codeChallenge,
      state: readParam(params, "state"),
      resource,
    },
  };
};

export interface TokenRequest {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string | null;
}

/** Parses the token exchange body, posted as `application/x-www-form-urlencoded`. */
export const parseTokenRequest = (params: URLSearchParams): ParsedRequest<TokenRequest> => {
  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code") {
    return {
      ok: false,
      error: grantType ? "unsupported_grant_type" : "invalid_request",
      description: "Only the authorization_code grant is supported.",
    };
  }

  const clientId = readParam(params, "client_id");
  const code = readParam(params, "code");
  const redirectUri = readParam(params, "redirect_uri");
  const codeVerifier = readParam(params, "code_verifier");
  if (!clientId || !code || !redirectUri || !codeVerifier) {
    return {
      ok: false,
      error: "invalid_request",
      description: "client_id, code, redirect_uri, and code_verifier are required.",
    };
  }

  return {
    ok: true,
    value: { clientId, code, redirectUri, codeVerifier, resource: readParam(params, "resource") },
  };
};

const REDIRECT_URI_MAX_COUNT = 3;
const CLIENT_NAME_MAX_CHARS = 100;

/**
 * The RFC 7591 registration body. Unknown metadata such as `grant_types` or
 * `token_endpoint_auth_method` is stripped, not rejected: section 2 says the
 * server must ignore fields it does not understand, and Claude Code sends
 * several. The response states the values Wirely actually uses.
 */
export const registrationBodySchema = z.object({
  client_name: z.string().trim().min(1).max(CLIENT_NAME_MAX_CHARS),
  redirect_uris: z
    .array(z.string())
    .min(1)
    .max(REDIRECT_URI_MAX_COUNT)
    .refine((uris) => uris.every((uri) => validateRedirectUri(uri) === null), {
      message:
        "Each redirect URI must be https, http on a loopback host, or a known client scheme, without userinfo or fragment.",
    }),
});
