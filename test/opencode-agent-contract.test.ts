import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

import {
  clampConceptCount,
  composeConceptBatchPrompt,
  MAX_CONCEPTS_PER_JOB,
} from "@/lib/opencode/conceptPrompt";
import { readBearerToken, hashApiToken, API_TOKEN_PREFIX } from "@/lib/auth/apiToken";
import { isUsableConceptHtml, sanitizeConceptTitle } from "@/lib/opencode/persistConcepts";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { parseBatchWireOutput } from "@/lib/wireOutput";

const read = (path: string) => readFileSync(path, "utf8");

describe("concept count clamping", () => {
  it("keeps a sane count inside the per-job ceiling", () => {
    expect(clampConceptCount(3)).toBe(3);
    expect(clampConceptCount(1)).toBe(1);
    expect(clampConceptCount(MAX_CONCEPTS_PER_JOB)).toBe(MAX_CONCEPTS_PER_JOB);
  });

  it("clamps values that would turn one job into a batch run", () => {
    expect(clampConceptCount(500)).toBe(MAX_CONCEPTS_PER_JOB);
    expect(clampConceptCount(0)).toBe(1);
    expect(clampConceptCount(-4)).toBe(1);
  });

  it("falls back to one for junk input", () => {
    expect(clampConceptCount(undefined)).toBe(1);
    expect(clampConceptCount("abc")).toBe(1);
    expect(clampConceptCount(null)).toBe(1);
    expect(clampConceptCount(2.7)).toBe(2);
  });
});

describe("concept prompt", () => {
  it("asks for one marker block per requested concept", () => {
    const prompt = composeConceptBatchPrompt({ userPrompt: "A pricing page", conceptCount: 3 });

    for (const n of [1, 2, 3]) {
      expect(prompt).toContain(`TITLE_${n}:`);
      expect(prompt).toContain(`HTML_${n}:`);
    }
    expect(prompt).not.toContain("HTML_4:");
  });

  it("carries the user's request through verbatim", () => {
    const prompt = composeConceptBatchPrompt({
      userPrompt: "A dark analytics dashboard for freight",
      conceptCount: 2,
    });

    expect(prompt).toContain("A dark analytics dashboard for freight");
  });

  it("bans images unless the caller allows them", () => {
    const withoutImages = composeConceptBatchPrompt({ userPrompt: "x", conceptCount: 1 });
    const withImages = composeConceptBatchPrompt({
      userPrompt: "x",
      conceptCount: 1,
      allowImages: true,
    });

    expect(withoutImages).toContain("Do not use <img>");
    expect(withImages).toContain("descriptive alt text");
  });

  it("tells the model not to touch the filesystem", () => {
    const prompt = composeConceptBatchPrompt({ userPrompt: "x", conceptCount: 1 });

    expect(prompt).toContain("Do not read or write any files");
    expect(prompt).toContain("Do not run any commands");
  });

  /**
   * The contract that actually matters: the format the prompt asks for has to be
   * the format `parseBatchWireOutput` reads. If either side drifts, concepts
   * silently vanish, so this round-trips a reply shaped the way the prompt asks.
   */
  it("round-trips through the existing batch parser", () => {
    const conceptCount = 3;
    const prompt = composeConceptBatchPrompt({ userPrompt: "A pricing page", conceptCount });
    expect(prompt).toContain("DETAILS:");

    const modelReply = [
      "DETAILS:",
      "Three directions for the pricing page. Each varies layout and density.",
      "",
      "TITLE_1:",
      "Editorial Columns",
      "",
      "HTML_1:",
      "<!doctype html><html><head><title>One</title></head><body class=\"bg-white text-black\"><h1>One</h1></body></html>",
      "",
      "TITLE_2:",
      "Dense Comparison",
      "",
      "HTML_2:",
      "<!doctype html><html><head><title>Two</title></head><body class=\"bg-white text-black\"><h1>Two</h1></body></html>",
      "",
      "TITLE_3:",
      "Single Card",
      "",
      "HTML_3:",
      "<!doctype html><html><head><title>Three</title></head><body class=\"bg-white text-black\"><h1>Three</h1></body></html>",
    ].join("\n");

    const parsed = parseBatchWireOutput(modelReply, conceptCount);

    expect(parsed.details).toContain("Three directions");
    expect(parsed.titleByIndex).toEqual([
      "Editorial Columns",
      "Dense Comparison",
      "Single Card",
    ]);
    expect(parsed.htmlByIndex).toHaveLength(3);
    for (const html of parsed.htmlByIndex) {
      expect(html.toLowerCase()).toStartWith("<!doctype html>");
    }
    expect(parsed.htmlByIndex[1]).toContain("<h1>Two</h1>");
  });

  it("round-trips a single concept too", () => {
    const modelReply = [
      "DETAILS:",
      "One direction.",
      "",
      "TITLE_1:",
      "Minimal",
      "",
      "HTML_1:",
      "<!doctype html><html><body><h1>Only</h1></body></html>",
    ].join("\n");

    const parsed = parseBatchWireOutput(modelReply, 1);

    expect(parsed.titleByIndex[0]).toBe("Minimal");
    expect(parsed.htmlByIndex[0]).toContain("<h1>Only</h1>");
  });
});

describe("untrusted model output", () => {
  /**
   * Taken from a real run where a weaker model leaked its chain-of-thought into
   * the marker sections. The batch parser faithfully returned it, so the guard
   * has to be downstream of the parser.
   */
  const LEAKED_REASONING_TITLE =
    'Minimalist\n\nHTML_1 as described.\n\nThen TITLE_2: Compact\n\nMake sure no markdown, no code fences. The output should be plain text with those sections. But the user said "Do not use markdown".';

  it("keeps only the first line of a title that leaked reasoning", () => {
    expect(sanitizeConceptTitle(LEAKED_REASONING_TITLE)).toBe("Minimalist");
  });

  it("clamps an overlong single-line title", () => {
    const title = sanitizeConceptTitle("x".repeat(500));

    expect(title).toHaveLength(80);
  });

  it("rejects a title that is really a marker", () => {
    expect(sanitizeConceptTitle("HTML_2:")).toBeNull();
    expect(sanitizeConceptTitle("TITLE_3: something")).toBeNull();
    expect(sanitizeConceptTitle("DETAILS:")).toBeNull();
  });

  it("rejects empty and whitespace titles", () => {
    expect(sanitizeConceptTitle(undefined)).toBeNull();
    expect(sanitizeConceptTitle("")).toBeNull();
    expect(sanitizeConceptTitle("   \n  ")).toBeNull();
  });

  it("keeps an ordinary title untouched", () => {
    expect(sanitizeConceptTitle("Compact Efficient")).toBe("Compact Efficient");
  });

  it("rejects a doctype-only stub as a concept", () => {
    // The 56-byte shape a real run produced.
    expect(isUsableConceptHtml("<!doctype html><html><body></body></html>")).toBe(false);
  });

  it("rejects HTML with no body element", () => {
    const headOnly = `<!doctype html><html><head>${"<meta>".repeat(200)}</head></html>`;

    expect(isUsableConceptHtml(headOnly)).toBe(false);
  });

  it("accepts a real concept document", () => {
    const real = `<!doctype html><html><head><title>Pricing</title></head><body class="bg-white">${"<section>content</section>".repeat(30)}</body></html>`;

    expect(isUsableConceptHtml(real)).toBe(true);
  });
});

describe("agent token handling", () => {
  it("hashes deterministically and differently per token", () => {
    const a = `${API_TOKEN_PREFIX}aaa`;
    const b = `${API_TOKEN_PREFIX}bbb`;

    expect(hashApiToken(a)).toBe(hashApiToken(a));
    expect(hashApiToken(a)).not.toBe(hashApiToken(b));
    expect(hashApiToken(a)).toHaveLength(64);
  });

  it("reads a bearer header case-insensitively", () => {
    expect(readBearerToken("Bearer abc123")).toBe("abc123");
    expect(readBearerToken("bearer abc123")).toBe("abc123");
    expect(readBearerToken("  Bearer   abc123  ")).toBe("abc123");
  });

  it("rejects headers that are not a bearer token", () => {
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken("")).toBeNull();
    expect(readBearerToken("Basic abc123")).toBeNull();
    expect(readBearerToken("Bearer")).toBeNull();
    expect(readBearerToken("Bearer a b")).toBeNull();
  });
});

describe("agent route guards", () => {
  it("authenticates every agent route with a bearer token, never a session", () => {
    const agentRoutes = [
      "app/api/agent/jobs/next/route.ts",
      "app/api/agent/jobs/[jobId]/result/route.ts",
    ];

    for (const path of agentRoutes) {
      const source = read(path);
      expect(source.includes("authenticateAgentRequest")).toBe(true);
      expect(source.includes("Unauthenticated")).toBe(true);
      // A leaked agent token must not reach the session-authenticated surface.
      expect(source.includes("getRequestSessionUser")).toBe(false);
    }
  });

  it("authenticates every browser-facing concept route with a session, never a token", () => {
    const browserRoutes = [
      "app/api/projects/[projectId]/concepts/route.ts",
      "app/api/projects/[projectId]/concepts/[jobId]/route.ts",
      "app/api/profile/agent-tokens/route.ts",
    ];

    for (const path of browserRoutes) {
      const source = read(path);
      expect(source.includes("getRequestSessionUser")).toBe(true);
      expect(source.includes("Unauthenticated")).toBe(true);
      expect(source.includes("authenticateAgentRequest")).toBe(false);
    }
  });

  it("keeps the runtime contract on the new routes", () => {
    const routes = [
      "app/api/agent/jobs/next/route.ts",
      "app/api/agent/jobs/[jobId]/result/route.ts",
      "app/api/projects/[projectId]/concepts/route.ts",
      "app/api/projects/[projectId]/concepts/[jobId]/route.ts",
      "app/api/profile/agent-tokens/route.ts",
    ];

    for (const path of routes) {
      const source = read(path);
      expect(source.includes('runtime = "nodejs"')).toBe(true);
      expect(source.includes('dynamic = "force-dynamic"')).toBe(true);
    }
  });

  it("refuses to queue when no agent is connected or one is already running", () => {
    const source = read("app/api/projects/[projectId]/concepts/route.ts");

    expect(source.includes("isLocalAgentOnline")).toBe(true);
    expect(source.includes("hasActiveAgentJob")).toBe(true);
    expect(source.includes("{ status: 409 }")).toBe(true);
  });

  it("never returns raw model text to the browser", () => {
    const source = read("app/api/projects/[projectId]/concepts/[jobId]/route.ts");

    expect(source.includes("resultText")).toBe(false);
  });

  it("keeps ownership checks on the queue route", () => {
    const source = read("app/api/projects/[projectId]/concepts/route.ts");

    expect(source.includes("getProjectForUser")).toBe(true);
    expect(source.includes("{ status: 404 }")).toBe(true);
    expect(source.includes("readJsonBodyWithLimit")).toBe(true);
  });
});

describe("credential containment", () => {
  it("keeps provider credentials out of the agent job table", () => {
    const schema = read("lib/db/schema.ts");
    const agentJobsBlock = schema.slice(
      schema.indexOf('export const agentJobs = pgTable('),
      schema.indexOf("export type ProjectStatus"),
    );

    for (const forbidden of ["apiKey", "ApiKey", "token", "Ciphertext", "secret"]) {
      expect(agentJobsBlock).not.toContain(forbidden);
    }
  });

  it("stores only a hash of an agent token, never the plaintext", () => {
    const schema = read("lib/db/schema.ts");
    const tokensBlock = schema.slice(
      schema.indexOf("export const apiTokens = pgTable("),
      schema.indexOf("export const agentJobs = pgTable("),
    );

    expect(tokensBlock).toContain("tokenHash");
    expect(tokensBlock).not.toMatch(/\btoken:\s*text\(/);
  });
});

describe("unmigrated database", () => {
  it("recognises a postgres missing-relation error at either nesting level", () => {
    expect(isMissingRelationError({ code: "42P01" })).toBe(true);
    expect(isMissingRelationError({ cause: { code: "42P01" } })).toBe(true);
    expect(
      isMissingRelationError({ message: 'relation "api_tokens" does not exist' }),
    ).toBe(true);
    expect(
      isMissingRelationError({ cause: { message: 'relation "agent_jobs" does not exist' } }),
    ).toBe(true);
  });

  it("does not swallow unrelated database errors", () => {
    expect(isMissingRelationError({ code: "23505" })).toBe(false);
    expect(isMissingRelationError(new Error("connection refused"))).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
    expect(isMissingRelationError("nope")).toBe(false);
  });

  it("degrades the agent panel instead of failing the whole settings page", () => {
    // Settings renders Account and Providers too; one missing table must not
    // take those down with it.
    const localAgent = read("lib/db/queries/localAgent.ts");
    const tokens = read("lib/auth/apiToken.ts");

    for (const source of [localAgent, tokens]) {
      expect(source.includes("isMissingRelationError")).toBe(true);
    }
    expect(localAgent.includes("return false")).toBe(true);
    expect(tokens.includes("return [];")).toBe(true);
  });
});
