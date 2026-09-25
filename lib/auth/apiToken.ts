/**
 * Personal access tokens for the Wirely MCP server.
 *
 * An MCP client cannot carry a Clerk browser session, so it authenticates with a
 * bearer token the user mints once in settings. Only the SHA-256 hash is
 * persisted, and the plaintext is shown exactly once at creation.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { apiTokens, users } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";

export const API_TOKEN_PREFIX = "wirely_";
const PREFIX_DISPLAY_LENGTH = API_TOKEN_PREFIX.length + 6;

export const hashApiToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

/**
 * Compares two hex hashes without leaking a match position through timing.
 * Length is checked first because timingSafeEqual throws on a length mismatch.
 */
const hashesMatch = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
};

export interface CreatedApiToken {
  id: string;
  name: string;
  prefix: string;
  /** Plaintext. Returned once, never stored, never logged. */
  token: string;
}

export const createApiToken = async (
  userId: string,
  name = "MCP"
): Promise<CreatedApiToken> => {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const prefix = token.slice(0, PREFIX_DISPLAY_LENGTH);
  const db = getDb();

  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash: hashApiToken(token), prefix })
    .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix });

  return { id: row.id, name: row.name, prefix: row.prefix, token };
};

/**
 * Lists a user's live tokens.
 *
 * Returns an empty list rather than throwing when the table is missing, so the
 * settings page still renders on a database that has not been migrated yet.
 */
export const listApiTokens = async (userId: string) => {
  try {
    const db = getDb();
    return await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    return [];
  }
};

export const revokeApiToken = async (userId: string, tokenId: string): Promise<boolean> => {
  const db = getDb();
  const revoked = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });

  return revoked.length > 0;
};

/**
 * How stale `lastUsedAt` may get before a request refreshes it, so a burst of
 * MCP calls costs one write instead of one per call.
 */
const TOKEN_TOUCH_INTERVAL_MS = 30_000;

export const getUserForApiToken = async (token: string): Promise<SessionUser | null> => {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;

  const tokenHash = hashApiToken(token);
  const db = getDb();

  const [row] = await db
    .select({
      tokenId: apiTokens.id,
      tokenHash: apiTokens.tokenHash,
      lastUsedAt: apiTokens.lastUsedAt,
      id: users.id,
      authSub: users.authSub,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
    .limit(1);

  if (!row || !hashesMatch(row.tokenHash, tokenHash)) return null;

  const lastUsed = row.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - lastUsed > TOKEN_TOUCH_INTERVAL_MS) {
    // Best effort: a failed touch must not fail the request it is annotating.
    void db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.tokenId))
      .catch(() => undefined);
  }

  return {
    id: row.id,
    authSub: row.authSub,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
  };
};

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export const readBearerToken = (header: string | null): string | null => {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
};

/**
 * Authenticates an MCP request.
 *
 * Deliberately separate from `getRequestSessionUser`: tokens are accepted only
 * on `/api/mcp`, so a leaked token cannot reach the profile routes that read
 * and write the user's encrypted provider keys.
 */
export const authenticateAgentRequest = async (
  request: Request,
): Promise<SessionUser | null> => {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return null;
  return getUserForApiToken(token);
};
