/**
 * The origin Wirely advertises in links it hands out: the canonical www
 * production host, the same one the sitemap, robots.txt, and metadataBase
 * name.
 */
export const CANONICAL_APP_ORIGIN = "https://www.wirely.site";

/** The bare Vercel deployment domain, which MCP client setups often name. */
const VERCEL_DEPLOYMENT_ORIGIN = "https://wirely.vercel.app";

/**
 * The origin to build editor links from for one MCP request. Clients still
 * pointed at the bare Vercel deployment domain get canonical links, so the
 * project links in tool results stay shareable; every other origin
 * (localhost, preview deployments) passes through unchanged.
 */
export const editorLinkOrigin = (requestOrigin: string): string =>
  requestOrigin === VERCEL_DEPLOYMENT_ORIGIN ? CANONICAL_APP_ORIGIN : requestOrigin;
