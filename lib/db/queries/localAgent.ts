import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { apiTokens } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/**
 * How recently a token must have been used for its agent to count as online.
 *
 * The agent asks `/api/agent/jobs/next` for work every 2s while a session is
 * active and every 8s once idle, and each poll touches `lastUsedAt`, so a live
 * agent refreshes this well inside the window. Deriving liveness this way avoids
 * a heartbeat table and a heartbeat endpoint. Keep this comfortably above the
 * agent's idle interval or a connected agent will flicker offline.
 */
const ONLINE_WINDOW_MS = 90_000;

let loggedMissingAgentTables = false;

/**
 * Reports the local-agent tables as absent exactly once per process.
 *
 * Settings renders on every visit, so an unmigrated database would otherwise
 * fill the log with the same warning.
 */
const logMissingAgentTables = (error: unknown) => {
  if (loggedMissingAgentTables) return;
  loggedMissingAgentTables = true;
  logger.warn("local_agent_tables_missing", {
    reason: "missing_agent_tables",
    message:
      "Local agent tables are not available yet. Run `bun run db:migrate` to enable the local agent.",
    code:
      error && typeof error === "object"
        ? ((error as { code?: string; cause?: { code?: string } }).code ??
          (error as { cause?: { code?: string } }).cause?.code ??
          "unknown")
        : "unknown",
  });
};

/**
 * True when an agent has polled recently enough to be considered connected.
 *
 * Returns false rather than throwing when the tables are missing, so an
 * unmigrated database degrades to "no agent" instead of failing the whole
 * settings page, including the tabs that have nothing to do with the agent.
 */
export const isLocalAgentOnline = async (userId: string): Promise<boolean> => {
  try {
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
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    logMissingAgentTables(error);
    return false;
  }
};
