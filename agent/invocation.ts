/**
 * How this agent was invoked, for use in its own help and error text.
 *
 * The agent runs two ways: as the linked `wirely-agent` binary, and as
 * `bun run agent -- <args>` from inside the repo. Hardcoding either one makes
 * the instructions wrong for half the people reading them, which has already
 * shipped twice.
 *
 * `process.argv` cannot tell the two apart. `bun link` symlinks straight to the
 * `.ts` file and the shebang re-executes it under bun, so `argv[1]` is the same
 * resolved source path either way. The package runner is what differs: it sets
 * `npm_lifecycle_event` to the script name, and the bare binary does not.
 *
 * Lives in its own module so a test can import it without the CLI's top-level
 * command dispatch running.
 */

/**
 * Derives the command prefix callers should be told to type.
 *
 * A set lifecycle event means this came through `bun run <script>`, which needs
 * `--` before its own arguments. Anything else is the installed binary.
 */
export const resolveInvocation = (lifecycleEvent: string | undefined): string =>
  lifecycleEvent ? "bun run agent --" : "wirely-agent";

export const INVOCATION = resolveInvocation(process.env.npm_lifecycle_event);
