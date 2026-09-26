/**
 * Signed, expiring links to one page's HTML, for the "Copy for agent" prompt.
 * A coding agent fetches the link without a Wirely session, so the signature
 * is the only access check. Links cannot be revoked one by one; they expire,
 * deleting the page kills them, and rotating the master secret kills them all.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { readCurrentMasterSecret } from "@/lib/security/userApiKeyCrypto";

export const PAGE_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Its own key, so a share signature can never double as anything the master
// secret protects.
const shareKey = (masterSecret: Buffer) =>
  createHmac("sha256", masterSecret).update("wirely-page-share-key").digest();

const sign = (pageId: string, expiresAt: number, masterSecret: Buffer) =>
  createHmac("sha256", shareKey(masterSecret))
    .update(`v1:${pageId}:${expiresAt}`)
    .digest("base64url");

export const createPageSharePath = (
  pageId: string,
  now = Date.now(),
  masterSecret = readCurrentMasterSecret(),
) => {
  const expiresAt = now + PAGE_SHARE_TTL_MS;
  const signature = sign(pageId, expiresAt, masterSecret);
  return {
    path: `/api/share/pages/${encodeURIComponent(pageId)}?exp=${expiresAt}&sig=${signature}`,
    expiresAt,
  };
};

export const verifyPageShare = (
  { pageId, exp, sig }: { pageId: string; exp: string | null; sig: string | null },
  now = Date.now(),
  masterSecret = readCurrentMasterSecret(),
) => {
  const expiresAt = Number(exp);
  if (!sig || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const expected = Buffer.from(sign(pageId, expiresAt, masterSecret));
  const actual = Buffer.from(sig);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
