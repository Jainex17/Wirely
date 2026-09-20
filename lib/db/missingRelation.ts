/**
 * Detects a Postgres "relation does not exist" error (SQLSTATE 42P01).
 *
 * Code can reach production before its migration does, and a fresh clone runs
 * before `bun run db:migrate` at least once. A feature whose table is missing
 * should degrade to "unavailable" rather than take down the whole page it
 * happens to render on.
 *
 * The driver nests the original error under `cause`, so both levels are checked.
 */
export const isMissingRelationError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: string;
    cause?: { code?: string; message?: string };
    message?: string;
  };

  return (
    candidate.code === "42P01" ||
    candidate.cause?.code === "42P01" ||
    candidate.message?.includes("does not exist") === true ||
    candidate.cause?.message?.includes("does not exist") === true
  );
};
