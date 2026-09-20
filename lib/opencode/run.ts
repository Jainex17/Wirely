/**
 * Spawns `opencode run` and folds its NDJSON output into a single result.
 *
 * Runs on the user's own machine inside the Wirely local agent, never on the
 * server. opencode's credentials stay where opencode put them; Wirely only ever
 * sees the prompt going in and the text coming out.
 */
import { spawn } from "node:child_process";

import { collectOpencodeEvents, parseOpencodeEventLine, type OpencodeRunResult } from "./events";
import {
  buildOpencodeRunArgs,
  detectOpencodeCapabilities,
  isSupportedOpencodeVersion,
  parseOpencodeVersion,
  type OpencodeCapabilities,
  type OpencodeVersion,
} from "./version";

export class OpencodeError extends Error {
  readonly kind:
    | "not_installed"
    | "unsupported_version"
    | "no_json_format"
    | "timeout"
    | "run_failed";

  constructor(kind: OpencodeError["kind"], message: string) {
    super(message);
    this.name = "OpencodeError";
    this.kind = kind;
  }
}

export interface OpencodeProbe {
  version: OpencodeVersion;
  capabilities: OpencodeCapabilities;
  binary: string;
}

interface CaptureResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

const capture = (
  binary: string,
  args: string[],
  options: { stdin?: string; cwd?: string; timeoutMs: number },
): Promise<CaptureResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      // opencode reads the prompt from stdin only when stdin is not a TTY,
      // which a piped stdio already guarantees.
      env: { ...process.env, NO_COLOR: "1" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // opencode spawns a server child; give it a moment, then insist.
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref?.();
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") {
        reject(
          new OpencodeError(
            "not_installed",
            `opencode was not found at "${binary}". Install it from https://opencode.ai and try again.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });

    if (options.stdin !== undefined) {
      child.stdin.end(options.stdin, "utf8");
    } else {
      child.stdin.end();
    }
  });

/**
 * Reads the local build's version and flag set.
 *
 * Called once when the agent starts. Everything downstream is driven by the
 * returned capabilities rather than by a version comparison, so a future
 * opencode that moves a flag around keeps working.
 */
export const probeOpencode = async (
  binary = "opencode",
  timeoutMs = 30_000,
): Promise<OpencodeProbe> => {
  const versionResult = await capture(binary, ["--version"], { timeoutMs });
  const version = parseOpencodeVersion(`${versionResult.stdout}${versionResult.stderr}`);

  if (!version) {
    throw new OpencodeError(
      "not_installed",
      `Could not read a version from "${binary} --version". Is opencode installed?`,
    );
  }
  if (!isSupportedOpencodeVersion(version)) {
    throw new OpencodeError(
      "unsupported_version",
      `opencode ${version.raw} is too old. Wirely needs 1.18.0 or newer. Run \`opencode upgrade\`.`,
    );
  }

  const helpResult = await capture(binary, ["run", "--help"], { timeoutMs });
  const capabilities = detectOpencodeCapabilities(
    `${helpResult.stdout}${helpResult.stderr}`,
  );

  if (!capabilities.jsonFormat) {
    throw new OpencodeError(
      "no_json_format",
      `opencode ${version.raw} does not support \`run --format json\`. Run \`opencode upgrade\`.`,
    );
  }

  return { version, capabilities, binary };
};

export interface RunOpencodeOptions {
  probe: OpencodeProbe;
  prompt: string;
  model?: string;
  variant?: string;
  agent?: string;
  /**
   * Working directory for the run. Callers should pass a scratch directory: any
   * tool the model reaches for is then bounded to somewhere disposable rather
   * than the user's real project.
   */
  cwd: string;
  timeoutMs?: number;
}

export const runOpencode = async ({
  probe,
  prompt,
  model,
  variant,
  agent,
  cwd,
  timeoutMs = 10 * 60_000,
}: RunOpencodeOptions): Promise<OpencodeRunResult> => {
  const args = buildOpencodeRunArgs({
    model,
    variant,
    agent,
    directory: cwd,
    capabilities: probe.capabilities,
  });

  const result = await capture(probe.binary, args, { stdin: prompt, cwd, timeoutMs });

  if (result.timedOut) {
    throw new OpencodeError(
      "timeout",
      `opencode did not finish within ${Math.round(timeoutMs / 1000)}s.`,
    );
  }

  const events = [];
  for (const line of result.stdout.split("\n")) {
    const event = parseOpencodeEventLine(line);
    if (event) events.push(event);
  }
  const folded = collectOpencodeEvents(events);

  // opencode sets a non-zero exit code alongside an error event. When it exits
  // non-zero without one, stderr is all we have.
  if (folded.error) return folded;
  if (result.code !== 0) {
    const detail = result.stderr.trim().split("\n").slice(-3).join(" ").trim();
    throw new OpencodeError(
      "run_failed",
      detail
        ? `opencode exited with code ${result.code}: ${detail}`
        : `opencode exited with code ${result.code}.`,
    );
  }

  return folded;
};
