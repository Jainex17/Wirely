import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";

/**
 * How recently a token must have been used for its agent to count as online.
 *
 * The agent long-polls `/api/agent/jobs/next` on a ~25s window and each poll
 * touches `lastUsedAt`, so a live agent refreshes this well inside the window.
 * Deriving liveness this way avoids a heartbeat table and a heartbeat endpoint.
 */
const ONLINE_WINDOW_MS = 90_000;

export const isLocalAgentOnline = async (userId: string): Promise<boolean> => {
  const db = getDb();
  const [row] = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt),
        gt(apiTokens.lastUsedAt, new Date(Date.now() - ONLINE_WINDOW_MS)),
      ),
    )
    .limit(1);

  return Boolean(row);
};
