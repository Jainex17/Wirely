#!/usr/bin/env bun
/**
 * Wirely local agent.
 *
 * Long-polls Wirely for queued design work, runs it through the opencode
 * already installed on this machine, and posts the text back. The connection is
 * outbound only: no port is opened, no tunnel is needed, and opencode's
 * credentials never leave the machine.
 *
 *   wirely-agent login <token>   save a token minted in Wirely settings
 *   wirely-agent                 start the loop
 *   wirely-agent doctor          check opencode and print what was detected
 *
 * Environment:
 *   WIRELY_URL     Wirely base URL (default https://wirely.app)
 *   WIRELY_TOKEN   token, overriding the saved one
 *   OPENCODE_BIN   path to the opencode binary (default `opencode`)
 *   WIRELY_MODEL   default `provider/model` when a job does not name one
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { OpencodeError, probeOpencode, runOpencode, type OpencodeProbe } from "../lib/opencode/run";
import { resolveOpencodeOutcome } from "../lib/opencode/events";

const CONFIG_PATH = join(homedir(), ".config", "wirely", "agent.json");
const DEFAULT_BASE_URL = "https://wirely.app";

/** Backoff bounds for a Wirely that is unreachable or erroring. */
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

interface AgentConfig {
  token?: string;
  baseUrl?: string;
}

interface AgentJob {
  id: string;
  projectId: string;
  prompt: string;
  model: string | null;
  variant: string | null;
  variantCount: number;
  attempts: number;
}

const readConfig = (): AgentConfig => {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AgentConfig;
  } catch {
    return {};
  }
};

const writeConfig = (config: AgentConfig) => {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  // The token is a credential, so keep the file owner-readable only.
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
};

const resolveSettings = () => {
  const config = readConfig();
  const token = process.env.WIRELY_TOKEN ?? config.token;
  const baseUrl = (process.env.WIRELY_URL ?? config.baseUrl ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
  return { token, baseUrl };
};

const log = (message: string) => {
  console.log(`[wirely] ${new Date().toISOString().slice(11, 19)} ${message}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claims the next job. Returns null when the poll window closed empty, which is
 * the normal idle case rather than an error.
 */
const claimJob = async (baseUrl: string, token: string): Promise<AgentJob | null> => {
  const response = await fetch(`${baseUrl}/api/agent/jobs/next`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (response.status === 204) return null;
  if (response.status === 401) {
    throw new Error("Wirely rejected the token. Run `wirely-agent login <token>` again.");
  }
  if (!response.ok) {
    throw new Error(`Wirely returned ${response.status} when claiming a job.`);
  }

  const body = (await response.json()) as { job?: AgentJob };
  return body.job ?? null;
};

const reportResult = async (
  baseUrl: string,
  token: string,
  jobId: string,
  payload: { text: string } | { error: string },
) => {
  const response = await fetch(`${baseUrl}/api/agent/jobs/${jobId}/result`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Wirely returned ${response.status} when posting the result.`);
  }

  return (await response.json()) as { status?: string; concepts?: unknown[] };
};

/**
 * Runs one job.
 *
 * The scratch directory is the containment boundary: if the model reaches for a
 * file tool despite being told not to, it lands somewhere disposable rather
 * than in the user's real work.
 */
const runJob = async (
  probe: OpencodeProbe,
  job: AgentJob,
  baseUrl: string,
  token: string,
) => {
  const scratch = mkdtempSync(join(tmpdir(), "wirely-job-"));

  try {
    const model = job.model ?? process.env.WIRELY_MODEL ?? undefined;
    log(`running job ${job.id.slice(0, 8)} (${job.variantCount} concepts, ${model ?? "default model"})`);

    const result = await runOpencode({
      probe,
      prompt: job.prompt,
      model,
      variant: job.variant ?? undefined,
      cwd: scratch,
    });

    const outcome = resolveOpencodeOutcome(result);
    if (outcome.kind === "error") {
      log(`job ${job.id.slice(0, 8)} failed: ${outcome.message}`);
      await reportResult(baseUrl, token, job.id, { error: outcome.message });
      return;
    }
    if (outcome.warning) {
      log(`job ${job.id.slice(0, 8)} finished with a warning: ${outcome.warning}`);
    }

    const reported = await reportResult(baseUrl, token, job.id, { text: outcome.text });
    log(
      reported.status === "completed"
        ? `job ${job.id.slice(0, 8)} done (${reported.concepts?.length ?? 0} concepts)`
        : `job ${job.id.slice(0, 8)} reported ${reported.status}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`job ${job.id.slice(0, 8)} errored: ${message}`);
    // Best effort: if this post also fails the stale-claim sweep reclaims the job.
    await reportResult(baseUrl, token, job.id, { error: message }).catch(() => undefined);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

const commandLogin = (token: string | undefined) => {
  if (!token) {
    console.error("Usage: wirely-agent login <token>");
    process.exit(1);
  }
  const config = readConfig();
  writeConfig({ ...config, token, baseUrl: process.env.WIRELY_URL ?? config.baseUrl });
  log(`token saved to ${CONFIG_PATH}`);
};

const commandDoctor = async () => {
  const { token, baseUrl } = resolveSettings();
  console.log(`Wirely URL:  ${baseUrl}`);
  console.log(`Token:       ${token ? "saved" : "missing (run `wirely-agent login <token>`)"}`);

  try {
    const probe = await probeOpencode(process.env.OPENCODE_BIN);
    console.log(`opencode:    ${probe.version.raw} at ${probe.binary}`);
    console.log(`flags:       ${JSON.stringify(probe.capabilities)}`);
  } catch (error) {
    console.log(`opencode:    ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
};

const commandRun = async () => {
  const { token, baseUrl } = resolveSettings();
  if (!token) {
    console.error("No token. Mint one in Wirely settings, then run `wirely-agent login <token>`.");
    process.exit(1);
  }

  let probe: OpencodeProbe;
  try {
    probe = await probeOpencode(process.env.OPENCODE_BIN);
  } catch (error) {
    if (error instanceof OpencodeError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  log(`opencode ${probe.version.raw} ready, polling ${baseUrl}`);

  let backoff = MIN_BACKOFF_MS;
  let running = true;
  process.on("SIGINT", () => {
    running = false;
    log("stopping");
    process.exit(0);
  });

  while (running) {
    try {
      const job = await claimJob(baseUrl, token);
      backoff = MIN_BACKOFF_MS;
      if (job) {
        await runJob(probe, job, baseUrl, token);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`${message} (retrying in ${Math.round(backoff / 1000)}s)`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
};

const [command, argument] = process.argv.slice(2);

if (command === "login") {
  commandLogin(argument);
} else if (command === "doctor") {
  await commandDoctor();
} else if (command === undefined || command === "run") {
  await commandRun();
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Usage: wirely-agent [run|login <token>|doctor]");
  process.exit(1);
}
