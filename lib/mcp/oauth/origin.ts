/**
 * The issuer/origin for the connect flow, read the same way on the consent
 * page and the POST handler: the host the browser actually reached, so the
 * `resource` bound at authorize is the one the token exchange re-checks.
 *
 * The proxy sets forwarded headers in production; locally they are absent and
 * the protocol falls back to http on a loopback host.
 */
import { headers } from "next/headers";

import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";

const LOOPBACK_HOST_PATTERN = /^(localhost|127\.)/;

export const issuerFromHeaders = (headerList: Headers): string => {
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  if (!host) return CANONICAL_APP_ORIGIN;
  const forwardedProto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto ?? (LOOPBACK_HOST_PATTERN.test(host) ? "http" : "https");
  return `${proto}://${host}`;
};

export const requestIssuer = async (): Promise<string> => issuerFromHeaders(await headers());
