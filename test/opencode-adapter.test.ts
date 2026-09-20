import { describe, expect, it } from "bun:test";
import {
  collectOpencodeEvents,
  parseOpencodeEventLine,
  parseOpencodeStdout,
  resolveOpencodeOutcome,
} from "@/lib/opencode/events";
import {
  buildOpencodeRunArgs,
  detectOpencodeCapabilities,
  isSupportedOpencodeVersion,
  parseOpencodeVersion,
} from "@/lib/opencode/version";

/**
 * Captured verbatim from `opencode run --format json` on v2.0.10. The blank
 * `text` event ordering and the `time` field are kept as emitted.
 */
const V2_SUCCESS_STDOUT = [
  '{"type":"step_start","timestamp":1789892257169,"sessionID":"ses_f421c2a89ffeOg5sM6Qh0vEvm9","part":{"id":"prt_0bde46591001quoLz6gniXh5fH","sessionID":"ses_f421c2a89ffeOg5sM6Qh0vEvm9","messageID":"msg_0bde3d597001bC4LxbIzkFiyiY","type":"step-start"}}',
  '{"type":"step_start","timestamp":1789892260670,"sessionID":"ses_f421c2a89ffeOg5sM6Qh0vEvm9","part":{"id":"prt_0bde4733e001QK3epkGBkZyzMX","sessionID":"ses_f421c2a89ffeOg5sM6Qh0vEvm9","messageID":"msg_0bde3d597001bC4LxbIzkFiyiY","type":"step-start"}}',
  '{"type":"text","timestamp":1789892262223,"sessionID":"ses_f421c2a89ffeOg5sM6Qh0vEvm9","part":{"id":"prt_0bde3d597001bC4LxbIzkFiyiY_text-0","sessionID":"ses_f421c2a89ffeOg5sM6Qh0vEvm9","messageID":"msg_0bde3d597001bC4LxbIzkFiyiY","type":"text","text":"HELLO_WIRELY","time":{"start":1789892259483,"end":1789892262223}}}',
].join("\n");

/** Captured verbatim from a bad model id on v2.0.10. */
const V2_ERROR_STDOUT =
  '{"type":"error","timestamp":1789892213899,"sessionID":"ses_f421c4394ffewGVob6e4TmCYsg","error":{"type":"provider.no-route","message":"Model unavailable: github-copilot/gemini-3.5-flash"}}';

/** `opencode run --help` on v2.0.10, trimmed to the flag block. */
const V2_RUN_HELP = `
FLAGS
  --standalone            Run with a private server instead of the background service
  --server string         Connect to a server URL instead of the background service
  --continue, -c          Continue the last session
  --session, -s string    Session ID to continue
  --fork                  Fork the session before continuing
  --model, -m string      Model to use in the format provider/model#variant
  --agent string          Agent to use
  --format choice         Output format (choices: default, json)
  --file, -f string       File to attach to the message
  --title string          Session title
  --thinking              Show thinking blocks
  --auto                  Auto-approve permissions that are not explicitly denied
`;

/** The 1.18.x flag set, which carries --variant and --dir instead. */
const V1_RUN_HELP = `
Options:
  --command    slash command to execute
  --continue   continue the last session
  --session    session id to continue
  --fork       fork the session before continuing
  --share      share the session
  --model      model to use in the format of provider/model
  --agent      agent to use
  --format     format: default (formatted) or json (raw JSON events)
  --file       file to attach
  --title      session title
  --dir        directory to run in
  --port       port to use
  --variant    model variant
  --thinking   show thinking blocks
  --auto       auto-approve permissions
  --yolo       skip all permission checks
`;

describe("opencode version parsing", () => {
  it("reads the version out of every shape the two lines print", () => {
    expect(parseOpencodeVersion("opencode v2.0.10")?.raw).toBe("2.0.10");
    expect(parseOpencodeVersion("v1.18.31")?.raw).toBe("1.18.31");
    expect(parseOpencodeVersion("1.18.31\n")?.raw).toBe("1.18.31");
    expect(parseOpencodeVersion("opencode 2.1.0-beta.3")?.raw).toBe("2.1.0");
  });

  it("returns null when there is no version to find", () => {
    expect(parseOpencodeVersion("command not found: opencode")).toBeNull();
    expect(parseOpencodeVersion("")).toBeNull();
  });

  it("gates on the minimum version across major lines", () => {
    const supported = ["2.0.10", "1.18.0", "1.18.31", "3.0.0"];
    for (const raw of supported) {
      expect(isSupportedOpencodeVersion(parseOpencodeVersion(raw)!)).toBe(true);
    }

    const unsupported = ["1.17.9", "1.0.0", "0.9.4"];
    for (const raw of unsupported) {
      expect(isSupportedOpencodeVersion(parseOpencodeVersion(raw)!)).toBe(false);
    }
  });
});

describe("opencode capability detection", () => {
  it("detects the v2.0.x flag set", () => {
    const capabilities = detectOpencodeCapabilities(V2_RUN_HELP);

    expect(capabilities.jsonFormat).toBe(true);
    expect(capabilities.model).toBe(true);
    expect(capabilities.standaloneFlag).toBe(true);
    expect(capabilities.agentFlag).toBe(true);
    // 2.x folds the variant into the model string and has no --dir.
    expect(capabilities.variantFlag).toBe(false);
    expect(capabilities.dirFlag).toBe(false);
  });

  it("detects the v1.18.x flag set", () => {
    const capabilities = detectOpencodeCapabilities(V1_RUN_HELP);

    expect(capabilities.jsonFormat).toBe(true);
    expect(capabilities.model).toBe(true);
    expect(capabilities.variantFlag).toBe(true);
    expect(capabilities.dirFlag).toBe(true);
    expect(capabilities.standaloneFlag).toBe(false);
  });

  it("does not confuse --model with --models or --dir with --directory", () => {
    const capabilities = detectOpencodeCapabilities(
      "  --models   list models\n  --directory  where to run\n",
    );

    expect(capabilities.model).toBe(false);
    expect(capabilities.dirFlag).toBe(false);
  });

  it("reports no json format when the build cannot emit it", () => {
    expect(detectOpencodeCapabilities("  --model string\n").jsonFormat).toBe(false);
  });
});

describe("opencode run args", () => {
  it("routes the variant into the model string on v2", () => {
    const args = buildOpencodeRunArgs({
      model: "github-copilot/claude-opus-5",
      variant: "thinking",
      capabilities: detectOpencodeCapabilities(V2_RUN_HELP),
    });

    expect(args).toEqual([
      "run",
      "--format",
      "json",
      "--model",
      "github-copilot/claude-opus-5#thinking",
      "--standalone",
    ]);
  });

  it("routes the variant to its own flag on v1", () => {
    const args = buildOpencodeRunArgs({
      model: "github-copilot/claude-opus-5",
      variant: "thinking",
      directory: "/tmp/job",
      capabilities: detectOpencodeCapabilities(V1_RUN_HELP),
    });

    expect(args).toEqual([
      "run",
      "--format",
      "json",
      "--model",
      "github-copilot/claude-opus-5",
      "--variant",
      "thinking",
      "--dir",
      "/tmp/job",
      // v1 has no background service to isolate from.
    ]);
  });

  it("drops flags the local build does not accept", () => {
    const args = buildOpencodeRunArgs({
      model: "a/b",
      agent: "build",
      directory: "/tmp/job",
      capabilities: detectOpencodeCapabilities(V2_RUN_HELP),
    });

    expect(args).not.toContain("--dir");
    expect(args).toContain("--agent");
  });

  it("never puts the prompt in argv", () => {
    const args = buildOpencodeRunArgs({
      model: "a/b",
      capabilities: detectOpencodeCapabilities(V2_RUN_HELP),
    });

    expect(args.join(" ")).not.toMatch(/prompt|message/i);
  });
});

describe("opencode event parsing", () => {
  it("pulls the assistant text out of a real v2 run", () => {
    const result = parseOpencodeStdout(V2_SUCCESS_STDOUT);

    expect(result.text).toBe("HELLO_WIRELY");
    expect(result.error).toBeNull();
    expect(result.sessionID).toBe("ses_f421c2a89ffeOg5sM6Qh0vEvm9");
  });

  it("surfaces a real v2 provider error", () => {
    const result = parseOpencodeStdout(V2_ERROR_STDOUT);

    expect(result.error?.type).toBe("provider.no-route");
    expect(result.error?.message).toContain("Model unavailable");
    expect(result.text).toBe("");
  });

  it("keeps the last value per part id rather than appending deltas", () => {
    const result = collectOpencodeEvents([
      { type: "text", part: { id: "p1", text: "<!DOC" } },
      { type: "text", part: { id: "p1", text: "<!DOCTYPE html>" } },
    ]);

    expect(result.text).toBe("<!DOCTYPE html>");
  });

  it("concatenates distinct parts in first-seen order", () => {
    const result = collectOpencodeEvents([
      { type: "text", part: { id: "p1", text: "one " } },
      { type: "text", part: { id: "p2", text: "two" } },
      { type: "text", part: { id: "p1", text: "one " } },
    ]);

    expect(result.text).toBe("one two");
  });

  it("ignores reasoning, tool and step events", () => {
    const result = collectOpencodeEvents([
      { type: "step_start", part: { id: "s1" } },
      { type: "reasoning", part: { id: "r1", text: "thinking out loud" } },
      { type: "tool_use", part: { id: "t1", text: "ran a tool" } },
      { type: "text", part: { id: "p1", text: "answer" } },
      { type: "step_finish", part: { id: "s2" } },
    ]);

    expect(result.text).toBe("answer");
  });

  it("ignores event types it has never seen", () => {
    const result = collectOpencodeEvents([
      { type: "some_future_event_type", part: { id: "x", text: "noise" } },
      { type: "text", part: { id: "p1", text: "answer" } },
    ]);

    expect(result.text).toBe("answer");
  });

  it("keeps the first error when several are reported", () => {
    const result = collectOpencodeEvents([
      { type: "error", error: { type: "provider.no-route", message: "first" } },
      { type: "error", error: { type: "unknown", message: "second" } },
    ]);

    expect(result.error?.message).toBe("first");
  });

  it("survives non-JSON noise interleaved with events", () => {
    const stdout = [
      "A new version of opencode is available",
      "",
      '{"type":"text","sessionID":"ses_1","part":{"id":"p1","text":"answer"}}',
      "not json either",
    ].join("\n");

    expect(parseOpencodeStdout(stdout).text).toBe("answer");
  });

  it("rejects malformed lines without throwing", () => {
    expect(parseOpencodeEventLine("")).toBeNull();
    expect(parseOpencodeEventLine("   ")).toBeNull();
    expect(parseOpencodeEventLine("{ broken json")).toBeNull();
    expect(parseOpencodeEventLine('["array"]')).toBeNull();
    expect(parseOpencodeEventLine('{"no":"type"}')).toBeNull();
    expect(parseOpencodeEventLine('{"type":123}')).toBeNull();
  });

  it("gives an error a message even when opencode omits one", () => {
    const result = collectOpencodeEvents([{ type: "error", error: {} }]);

    expect(result.error?.type).toBe("unknown");
    expect(result.error?.message).toBeTruthy();
  });
});

describe("run outcome", () => {
  /**
   * Taken from a real run: the model returned two complete concepts and then the
   * provider ended the stream without a finish reason. Discarding that run would
   * throw away work the user already paid for.
   */
  it("keeps the text when a trailing error follows a complete answer", () => {
    const outcome = resolveOpencodeOutcome({
      text: "DETAILS:\nTwo concepts.\n\nHTML_1:\n<!doctype html>...",
      error: { type: "unknown", message: "OpenAI Chat stream ended without finish_reason" },
      sessionID: "ses_1",
    });

    expect(outcome.kind).toBe("text");
    if (outcome.kind !== "text") throw new Error("expected text outcome");
    expect(outcome.text).toContain("HTML_1:");
    expect(outcome.warning).toContain("finish_reason");
  });

  it("reports an error when there is no text to salvage", () => {
    const outcome = resolveOpencodeOutcome({
      text: "",
      error: { type: "provider.no-route", message: "Model unavailable" },
      sessionID: "ses_1",
    });

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") throw new Error("expected error outcome");
    expect(outcome.message).toBe("Model unavailable");
  });

  it("treats whitespace-only output as no output", () => {
    const outcome = resolveOpencodeOutcome({ text: "   \n  ", error: null, sessionID: null });

    expect(outcome.kind).toBe("error");
  });

  it("reports a clean success with no warning", () => {
    const outcome = resolveOpencodeOutcome({ text: "answer", error: null, sessionID: "ses_1" });

    expect(outcome.kind).toBe("text");
    if (outcome.kind !== "text") throw new Error("expected text outcome");
    expect(outcome.warning).toBeNull();
  });
});
