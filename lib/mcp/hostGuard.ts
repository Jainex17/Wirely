import { lookup } from "node:dns/promises";

import { isBlockedIpAddress, isBlockedUrlHost } from "@/lib/urlContext";

/**
 * Checks hosts for the headless browser on this server: website imports and
 * page screenshots. Resolves each host once per guard and refuses any that
 * points into a private range, so a page cannot make the server fetch an
 * internal service. Make one guard per page load.
 */
export const createHostGuard = () => {
  const verdicts = new Map<string, Promise<boolean>>();
  return (hostname: string) => {
    let verdict = verdicts.get(hostname);
    if (!verdict) {
      verdict = isBlockedUrlHost(hostname)
        ? Promise.resolve(false)
        : lookup(hostname, { all: true, verbatim: true }).then(
            (entries) => entries.length > 0 && !entries.some((entry) => isBlockedIpAddress(entry.address)),
            () => false,
          );
      verdicts.set(hostname, verdict);
    }
    return verdict;
  };
};

/** The http(s) host of a request URL, or null for anything else. */
export const requestHostname = (target: string) => {
  try {
    const parsed = new URL(target);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname : null;
  } catch {
    return null;
  }
};
