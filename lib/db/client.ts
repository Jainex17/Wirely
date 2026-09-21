import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// pg over TCP rather than @neondatabase/serverless: every route runs in the
// Node runtime, where a plain connection reaches both Neon and a local
// Postgres. The serverless driver only speaks Neon's WebSocket proxy protocol
// and cannot connect to a local database at all.

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const poolConfig = {
  max: parsePositiveInteger(process.env.DB_POOL_MAX, 5),
  connectionTimeoutMillis: parsePositiveInteger(
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
    3_000,
  ),
  idleTimeoutMillis: parsePositiveInteger(
    process.env.DB_POOL_IDLE_TIMEOUT_MS,
    10_000,
  ),
};

let cachedDb: ReturnType<typeof drizzle> | null = null;
let cachedPool: Pool | null = null;

export const getDb = () => {
  if (cachedDb) return cachedDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL.");
  }

  if (!cachedPool) {
    cachedPool = new Pool({
      connectionString,
      max: poolConfig.max,
      connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
      idleTimeoutMillis: poolConfig.idleTimeoutMillis,
    });
  }

  cachedDb = drizzle({ client: cachedPool });
  return cachedDb;
};
