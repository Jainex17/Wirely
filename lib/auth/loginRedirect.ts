const BASE = "http://wirely.local";

/** Where sign-in lands when nothing asked for a specific page. */
export const DEFAULT_RETURN_PATH = "/projects";

const toLocalPath = (value: string) => {
  try {
    const url = new URL(value, BASE);
    // A path starting with "//" is a protocol-relative URL to another host.
    if (url.origin !== BASE || url.pathname.startsWith("//") || url.pathname === "/login") {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const pathOf = (absoluteUrl: string) => {
  try {
    const url = new URL(absoluteUrl);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

/**
 * Where the login page sends the user after sign-in. Our own redirects pass
 * `next`. The Clerk proxy bounces signed-out visitors of /wire, /setting,
 * /share, and /mcp here with an absolute `redirect_url` instead, and dropping
 * it would strand a user mid MCP connect on the projects page. Only the path of
 * `redirect_url` is kept, and both are checked to stay on this site, so
 * neither can redirect off it.
 */
export const loginReturnPath = ({ next, redirectUrl }: { next?: string; redirectUrl?: string }) => {
  if (next !== undefined) return toLocalPath(next) ?? DEFAULT_RETURN_PATH;
  if (redirectUrl === undefined) return DEFAULT_RETURN_PATH;
  const path = pathOf(redirectUrl);
  return path === null ? DEFAULT_RETURN_PATH : (toLocalPath(path) ?? DEFAULT_RETURN_PATH);
};
