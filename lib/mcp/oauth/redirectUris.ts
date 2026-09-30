/**
 * Redirect URI policy for OAuth client registration.
 *
 * The redirect URI is the one value in the flow that an attacker helps type
 * in, so registration accepts only shapes that cannot bounce an authorization
 * code anywhere useful:
 *
 * - `https://` to any host,
 * - `http://` only on the loopback hosts the OAuth spec reserves for native
 *   client callbacks,
 * - a small fixed set of custom schemes shipped by known coding clients.
 *
 * Everything else — userinfo, fragments, unknown schemes, plain-host http —
 * is refused at registration. Matching later is exact string equality against
 * the registered list, never a prefix or origin comparison, so a lookalike
 * URL cannot collect a code.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const ALLOWED_CUSTOM_SCHEMES = new Set([
  "vscode",
  "vscode-insiders",
  "cursor",
  "windsurf",
  "claude",
  "zed",
]);

const MAX_REDIRECT_URI_CHARS = 500;

/**
 * Returns an error message when the URI is not acceptable, or null when it is.
 * The message is shown on the register response and on the authorize error
 * screen, so it stays non-sensitive by construction.
 */
export const validateRedirectUri = (value: string): string | null => {
  if (!value || value.length > MAX_REDIRECT_URI_CHARS) {
    return `A redirect URI is required, at most ${MAX_REDIRECT_URI_CHARS} characters.`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "The redirect URI must be an absolute URI.";
  }

  if (url.username || url.password) {
    return "The redirect URI must not carry userinfo.";
  }
  if (url.hash) {
    return "The redirect URI must not carry a fragment.";
  }
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:") {
    return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase())
      ? null
      : "http:// is only allowed on localhost, 127.0.0.1, or [::1].";
  }

  const scheme = url.protocol.replace(/:$/, "");
  return ALLOWED_CUSTOM_SCHEMES.has(scheme)
    ? null
    : `Custom redirect schemes are limited to: ${[...ALLOWED_CUSTOM_SCHEMES].join(", ")}.`;
};
