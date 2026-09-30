/**
 * OAuth connect-flow storage: dynamically registered clients and the
 * single-use authorization codes they earn.
 *
 * Codes are stored as SHA-256 hashes like api tokens, so a database read
 * cannot recover a usable code. Consumption is a guarded update — consumed or
 * expired codes stop matching — which makes a replay a no-op even if two
 * token requests race.
 */
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";

import { hashApiToken } from "@/lib/auth/apiToken";
import { getDb } from "@/lib/db/client";
import { oauthAuthorizationCodes, oauthClients } from "@/lib/db/schema";

export interface OauthClient {
  id: string;
  name: string;
  redirectUris: string[];
}

export const createOauthClient = async (
  name: string,
  redirectUris: string[],
): Promise<OauthClient> => {
  const db = getDb();
  const [row] = await db
    .insert(oauthClients)
    .values({ name, redirectUris })
    .returning({ id: oauthClients.id, name: oauthClients.name, redirectUris: oauthClients.redirectUris });
  return row;
};

export const getOauthClientById = async (id: string): Promise<OauthClient | null> => {
  const db = getDb();
  const [row] = await db
    .select({ id: oauthClients.id, name: oauthClients.name, redirectUris: oauthClients.redirectUris })
    .from(oauthClients)
    .where(eq(oauthClients.id, id))
    .limit(1);
  return row ?? null;
};

/** How long a code may sit between the user clicking Authorize and the exchange. */
const CODE_TTL_MS = 5 * 60_000;

export const createAuthorizationCode = async ({
  clientId,
  userId,
  redirectUri,
  codeChallenge,
}: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> => {
  const db = getDb();
  const code = `${randomBytes(32).toString("base64url")}`;

  await db.insert(oauthAuthorizationCodes).values({
    codeHash: hashApiToken(code),
    clientId,
    userId,
    redirectUri,
    codeChallenge,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  // No worker exists to reap codes, so each mint sweeps the day-old leftovers.
  await db
    .delete(oauthAuthorizationCodes)
    .where(lt(oauthAuthorizationCodes.expiresAt, new Date(Date.now() - 24 * 3_600_000)))
    .catch(() => undefined);

  return code;
};

/**
 * Burns one code and returns its binding, or null when the code is unknown,
 * already used, expired, or belongs to another client — the same answer for
 * every failure, so a probe learns nothing.
 */
export const consumeAuthorizationCode = async ({
  codeHash,
  clientId,
}: {
  codeHash: string;
  clientId: string;
}) => {
  const db = getDb();
  const [row] = await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, codeHash),
        eq(oauthAuthorizationCodes.clientId, clientId),
        isNull(oauthAuthorizationCodes.consumedAt),
        gt(oauthAuthorizationCodes.expiresAt, new Date()),
      ),
    )
    .returning({
      userId: oauthAuthorizationCodes.userId,
      redirectUri: oauthAuthorizationCodes.redirectUri,
      codeChallenge: oauthAuthorizationCodes.codeChallenge,
    });
  return row ?? null;
};
