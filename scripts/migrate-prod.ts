/**
 * Applies pending migrations to the production database.
 *
 * `bun run db:migrate` targets whichever DATABASE_URL .env.local ends with —
 * during local development that is a local Postgres, and running it while
 * pointed at the wrong database drifts the two apart. That drift has already
 * broken production once: the code deployed expecting columns the production
 * database did not have. This script makes the target explicit — it refuses
 * to run without PROD_DATABASE_URL and pins drizzle-kit to that connection.
 */
import { spawnSync } from "node:child_process";

const prodUrl = process.env.PROD_DATABASE_URL;
if (!prodUrl) {
  console.error(
    "PROD_DATABASE_URL is not set. Add the production (Neon) connection string to .env.local.",
  );
  process.exit(1);
}

const result = spawnSync("bunx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: prodUrl },
});

process.exit(result.status ?? 1);
