/**
 * opencode version + capability detection.
 *
 * opencode ships two live major lines (1.18.x and 2.0.x) with a fully
 * restructured codebase between them, but the `--format json` event contract is
 * identical in both. The flags are not: 1.18 takes `--variant` and `--dir`,
 * while 2.0 encodes the variant as `provider/model#variant` and uses the
 * working directory.
 *
 * Rather than hardcode a version matrix that rots on the next release, we probe
 * `opencode run --help` once per agent start and build the argv from the flags
 * that are actually present. The version is parsed only for reporting and for
 * the minimum-version gate.
 */

export interface OpencodeVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

export interface OpencodeCapabilities {
  /** `--format json` is available. Without it we refuse to run. */
  jsonFormat: boolean;
  /** `--model` / `-m` is available. */
  model: boolean;
  /** `--variant` exists as its own flag (1.18.x). 2.x uses `model#variant`. */
  variantFlag: boolean;
  /** `--dir` exists (1.18.x). 2.x relies on the working directory. */
  dirFlag: boolean;
  /** `--agent` is available. */
  agentFlag: boolean;
  /** `--standalone` runs a private server instead of the shared background service (2.x). */
  standaloneFlag: boolean;
}

/**
 * Parses the output of `opencode --version`.
 *
 * Accepts the shapes both lines have emitted: a bare `2.0.10`, a `v`-prefixed
 * `v2.0.10`, and the `opencode v2.0.10` form 2.0.x prints today. Extra build
 * metadata after the patch number is ignored.
 */
export const parseOpencodeVersion = (stdout: string): OpencodeVersion | null => {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(stdout);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: match[0],
  };
};

/**
 * The oldest line we will talk to. 1.18.0 is where `run --format json` settled
 * into the `{type, timestamp, sessionID, ...}` envelope this adapter parses.
 */
export const MINIMUM_OPENCODE_VERSION = { major: 1, minor: 18, patch: 0 } as const;

export const isSupportedOpencodeVersion = (version: OpencodeVersion): boolean => {
  if (version.major !== MINIMUM_OPENCODE_VERSION.major) {
    return version.major > MINIMUM_OPENCODE_VERSION.major;
  }
  if (version.minor !== MINIMUM_OPENCODE_VERSION.minor) {
    return version.minor > MINIMUM_OPENCODE_VERSION.minor;
  }
  return version.patch >= MINIMUM_OPENCODE_VERSION.patch;
};

/**
 * Reads `opencode run --help` output and reports which flags this build takes.
 *
 * Matches on a word boundary after the flag so `--model` does not match
 * `--models` and `--dir` does not match `--directory`.
 */
export const detectOpencodeCapabilities = (runHelpText: string): OpencodeCapabilities => {
  const hasFlag = (flag: string) =>
    new RegExp(`--${flag}(?![a-z0-9-])`, "i").test(runHelpText);

  return {
    jsonFormat: hasFlag("format") && /\bjson\b/i.test(runHelpText),
    model: hasFlag("model"),
    variantFlag: hasFlag("variant"),
    dirFlag: hasFlag("dir"),
    agentFlag: hasFlag("agent"),
    standaloneFlag: hasFlag("standalone"),
  };
};

export interface BuildRunArgsOptions {
  /** `provider/model`, e.g. `github-copilot/claude-opus-5`. */
  model?: string;
  /** Model variant. Routed to `--variant` or `model#variant` per capabilities. */
  variant?: string;
  /** opencode agent name, when the build supports `--agent`. */
  agent?: string;
  /** Working directory, passed as `--dir` only when the build supports it. */
  directory?: string;
  capabilities: OpencodeCapabilities;
}

/**
 * Builds argv for a non-interactive run, using only flags the local build
 * accepts. The prompt is deliberately not included: it is written to stdin so a
 * long generation prompt cannot overflow the platform argv limit or get mangled
 * by opencode's own space-splitting of positional message parts.
 */
export const buildOpencodeRunArgs = ({
  model,
  variant,
  agent,
  directory,
  capabilities,
}: BuildRunArgsOptions): string[] => {
  const args = ["run", "--format", "json"];

  if (model && capabilities.model) {
    // 2.x parses `provider/model#variant`; 1.18.x needs a separate --variant.
    args.push("--model", variant && !capabilities.variantFlag ? `${model}#${variant}` : model);
  }
  if (variant && capabilities.variantFlag) {
    args.push("--variant", variant);
  }
  if (agent && capabilities.agentFlag) {
    args.push("--agent", agent);
  }
  if (directory && capabilities.dirFlag) {
    args.push("--dir", directory);
  }
  // 2.x otherwise attaches to the user's shared background service, which would
  // interleave this run with their own opencode session.
  if (capabilities.standaloneFlag) {
    args.push("--standalone");
  }

  return args;
};
