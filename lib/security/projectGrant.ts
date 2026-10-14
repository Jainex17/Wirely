/**
 * Short lived signed links that let a shell command write to one project
 * without a Wirely session, for the image upload and the local page capture.
 * The link is the only credential, so each use gets its own HMAC key: an
 * upload signature can never double as a capture link or a share link.
 */
import { createHmac, timingSafeEqual } from "crypto";

const purposeKey = (purpose: string, masterSecret: Buffer) =>
  createHmac("sha256", masterSecret).update(purpose).digest();

const sign = (
  purpose: string,
  projectId: string,
  userId: string,
  expiresAt: number,
  masterSecret: Buffer,
) =>
  createHmac("sha256", purposeKey(purpose, masterSecret))
    .update(`v1:${projectId}:${userId}:${expiresAt}`)
    .digest("base64url");

/** Query parameters that grant `purpose` on the project until `now + ttlMs`. */
export const createProjectGrant = (
  purpose: string,
  { projectId, userId }: { projectId: string; userId: string },
  ttlMs: number,
  now: number,
  masterSecret: Buffer,
) => {
  const expiresAt = now + ttlMs;
  return new URLSearchParams({
    project: projectId,
    user: userId,
    exp: String(expiresAt),
    sig: sign(purpose, projectId, userId, expiresAt, masterSecret),
  });
};

/** The project and user a link was signed for, or null when it is forged or expired. */
export const verifyProjectGrant = (
  purpose: string,
  params: URLSearchParams,
  now: number,
  masterSecret: Buffer,
) => {
  const projectId = params.get("project");
  const userId = params.get("user");
  const sig = params.get("sig");
  const expiresAt = Number(params.get("exp"));
  if (!projectId || !userId || !sig || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    return null;
  }
  const expected = Buffer.from(sign(purpose, projectId, userId, expiresAt, masterSecret));
  const actual = Buffer.from(sig);
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? { projectId, userId }
    : null;
};
