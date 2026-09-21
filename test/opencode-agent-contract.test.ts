import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

import {
  clampConceptCount,
  composeConceptBatchPrompt,
  composeEditPrompt,
  CONCEPT_DIRECTIONS,
  MAX_CONCEPTS_PER_JOB,
  resolveRequestedConceptCount,
} from "@/lib/opencode/conceptPrompt";
import { readBearerToken, hashApiToken, API_TOKEN_PREFIX } from "@/lib/auth/apiToken";
import { isUsableConceptHtml, sanitizeConceptTitle } from "@/lib/opencode/persistConcepts";
import { resolveInvocation } from "@/agent/invocation";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { parseBatchWireOutput } from "@/lib/wireOutput";
import { WIRE_MODEL_OPTIONS, isOpencodeWireModel } from "@/lib/wireModels";
import { DEFAULT_OPENCODE_MODEL, isFreeOpencodeModel } from "@/lib/opencode/models";
import { fallbackTitleFromPrompt } from "@/app/api/projects/route";
import {
  ACTIVE_POLL_MS,
  ACTIVE_WINDOW_MS,
  DORMANT_POLL_MS,
  IDLE_POLL_MS,
  IDLE_WINDOW_MS,
  resolvePollDelayMs,
} from "@/lib/opencode/pollSchedule";

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

describe("concept count from the prompt", () => {
  it("reads a count the user stated in prose", () => {
    expect(resolveRequestedConceptCount("generate 2 concepts of a dashboard")).toBe(2);
    expect(resolveRequestedConceptCount("Give me 3 different variants for a login")).toBe(3);
    expect(resolveRequestedConceptCount("design 1 screen for onboarding")).toBe(1);
  });

  it("returns null when the prompt names no count", () => {
    expect(resolveRequestedConceptCount("a habit tracker dashboard")).toBeNull();
    expect(resolveRequestedConceptCount("two concepts please")).toBeNull();
  });

  it("clamps an unreasonable prose count", () => {
    expect(resolveRequestedConceptCount("make 50 concepts")).toBe(MAX_CONCEPTS_PER_JOB);
  });
});

describe("concept prompt", () => {
  it("stamps a one-concept run with its own design direction", () => {
    const prompt = composeConceptBatchPrompt({
      userPrompt: "A landing page",
      conceptCount: 1,
      direction: CONCEPT_DIRECTIONS[0],
    });

    expect(prompt).toContain("Design direction for this concept: Editorial and typographic");
    expect(prompt).not.toContain("Each concept must be a distinct design direction");
  });

  it("keeps the differentiate instruction for an undirected batch", () => {
    const prompt = composeConceptBatchPrompt({ userPrompt: "x", conceptCount: 3 });

    expect(prompt).toContain("Each concept must be a distinct design direction");
    expect(prompt).not.toContain("Design direction for this concept");
  });

  it("rotates distinct directions across the rungs", () => {
    const directions = new Set(CONCEPT_DIRECTIONS);
    expect(directions.size).toBe(CONCEPT_DIRECTIONS.length);
  });

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

describe("agent invocation text", () => {
  /**
   * process.argv is identical for both paths: `bun link` symlinks to the .ts
   * file and the shebang re-executes it under bun. Only the package runner's
   * lifecycle event distinguishes them.
   */
  it("names the repo script when run through bun run", () => {
    expect(resolveInvocation("agent")).toBe("bun run agent --");
    expect(resolveInvocation("agent:doctor")).toBe("bun run agent --");
  });

  it("names the binary when run directly", () => {
    expect(resolveInvocation(undefined)).toBe("wirely-agent");
    expect(resolveInvocation("")).toBe("wirely-agent");
  });

  it("keeps the panel and the CLI from hardcoding one invocation", () => {
    const cli = read("agent/wirely-agent.ts");
    // Every user-facing command string flows through INVOCATION.
    expect(cli.includes("INVOCATION")).toBe(true);
    expect(/Usage: (wirely-agent|bun run)/.test(cli)).toBe(false);
  });
});

describe("opencode models in the catalog", () => {
  it("lists opencode models as free and local", () => {
    const opencodeModels = WIRE_MODEL_OPTIONS.filter(
      (model) => model.provider === "opencode",
    );

    expect(opencodeModels.length).toBeGreaterThan(0);
    for (const model of opencodeModels) {
      // These run on the user's own machine, so they can never cost money.
      expect(model.tier).toBe("free");
      expect(isOpencodeWireModel(model.id)).toBe(true);
      expect(model.id.startsWith("opencode/")).toBe(true);
    }
  });

  it("defaults a job to a free model rather than the user's opencode default", () => {
    expect(isFreeOpencodeModel(DEFAULT_OPENCODE_MODEL)).toBe(true);
    const route = read("app/api/projects/[projectId]/concepts/route.ts");
    expect(route.includes("DEFAULT_OPENCODE_MODEL")).toBe(true);
  });

  it("does not mistake a hosted model for a local one", () => {
    expect(isOpencodeWireModel("gemini-3.8-flash")).toBe(false);
    expect(isOpencodeWireModel("glm-4.7-flash")).toBe(false);
    expect(isFreeOpencodeModel("openrouter/free")).toBe(false);
  });

  it("rejects an opencode model in the hosted wire route", () => {
    // Falling through would hit a provider client with no matching credential.
    const route = read("app/api/wire/[id]/route.ts");

    expect(route.includes("isOpencodeWireModel")).toBe(true);
    expect(route.includes("runs on your local agent")).toBe(true);
  });
});

describe("composer routing", () => {
  const sidebar = () => read("components/WirePromptSidebar.tsx");

  it("sends opencode models to the local agent, not the hosted route", () => {
    const source = sidebar();

    // The branch must sit in handleSubmit before any hosted-route call.
    expect(source.includes("isOpencodeWireModel(activeModelName)")).toBe(true);
    expect(source.includes("startLocalAgentGeneration")).toBe(true);
    expect(source.includes("/concepts")).toBe(true);
  });

  /**
   * Generation starts two ways: the composer, and the brief handed over from the
   * home page, which auto-runs on mount through its own code path. Guarding only
   * the composer left the home-page route posting to the hosted endpoint.
   */
  it("also routes the auto-run brief from the home page", () => {
    expect(sidebar().includes("isOpencodeWireModel(resolvedModel)")).toBe(true);
  });

  it("guards every generation entry point", () => {
    const source = sidebar();
    const guards = source.match(/isOpencodeWireModel\(/g) ?? [];

    // One per entry point: handleSubmit and the auto-run effect.
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it("reloads pages from the server after a local run", () => {
    const source = sidebar();

    // Concepts are written server-side, so the client cannot guess them.
    expect(source.includes("hydrateProject")).toBe(true);
    expect(source.includes("/pages`")).toBe(true);
  });

  it("gives up rather than polling a dead agent forever", () => {
    const source = sidebar();

    expect(source.includes("LOCAL_AGENT_TIMEOUT_MS")).toBe(true);
    expect(source.includes("did not finish in time")).toBe(true);
  });

  it("exposes the pages list the reload depends on", () => {
    const route = read("app/api/projects/[projectId]/pages/route.ts");

    expect(route.includes("export async function GET")).toBe(true);
    expect(route.includes("listProjectPagesForUser")).toBe(true);
    expect(route.includes("Unauthenticated")).toBe(true);
  });
});

describe("project title generation", () => {
  const route = () => read("app/api/projects/route.ts");

  it("titles with the model the user picked, on their own key", () => {
    const source = route();

    expect(source.includes("getUserAiSettingsForGeneration")).toBe(true);
    expect(source.includes("getLanguageModel")).toBe(true);
    // A title does not need the expensive model.
    expect(source.includes("resolveFastWireModelForStage")).toBe(true);
  });

  it("does not queue an agent job just to name a project", () => {
    // An opencode title would take tens of seconds and block project creation.
    expect(route().includes("isOpencodeWireModel(modelName)")).toBe(true);
  });

  it("still falls back when the user has no usable key", () => {
    const source = route();

    expect(source.includes("getKeyForWireModel")).toBe(true);
    expect(source.includes("fallbackTitleFromPrompt")).toBe(true);
  });

  it("builds provider clients from one shared resolver", () => {
    // The wire route used to carry its own copy of this.
    const wireRoute = read("app/api/wire/[id]/route.ts");

    expect(wireRoute.includes('from "@/lib/wireProviderClient"')).toBe(true);
    expect(wireRoute.includes("createGoogleGenerativeAI")).toBe(false);
    expect(wireRoute.includes("createOpenRouter")).toBe(false);
  });
});

describe("local run result ordering", () => {
  const resultRoute = () => read("app/api/agent/jobs/[jobId]/result/route.ts");

  /**
   * The client polls job status and fetches pages the moment it reads
   * "completed". Marking the job complete before writing the concepts let it
   * fetch a half-written project and render an empty frame.
   */
  it("writes the concepts before announcing completion", () => {
    const source = resultRoute();
    const claimed = source.indexOf("claimAgentJobResult");
    const persisted = source.indexOf("persistAgentConcepts(");
    const completed = source.indexOf("completeAgentJob(");

    expect(claimed).toBeGreaterThan(-1);
    expect(persisted).toBeGreaterThan(claimed);
    expect(completed).toBeGreaterThan(persisted);
  });

  it("claims the result idempotently so a retry cannot double-write", () => {
    const queries = read("lib/db/queries/agentJobs.ts");

    expect(queries.includes("isNull(agentJobs.resultText)")).toBe(true);
  });

  it("records both sides of the exchange so the sidebar is not empty", () => {
    // The run never touches the chat route, so nothing else writes these.
    expect(read("app/api/projects/[projectId]/concepts/route.ts")).toContain(
      'role: "user"',
    );
    expect(resultRoute()).toContain('role: "assistant"');
  });

  it("shows the exchange without waiting for a reload", () => {
    expect(read("components/WirePromptSidebar.tsx")).toContain("setMessages");
  });
});

describe("editing an existing page", () => {
  const currentHtml = "<!doctype html><html><body>the original screen</body></html>";

  it("asks for a revision, not a redesign, and carries the current document", () => {
    const prompt = composeEditPrompt({
      userPrompt: "make the primary button amber",
      currentHtml,
    });

    expect(prompt).toContain("make the primary button amber");
    expect(prompt).toContain(currentHtml);
    expect(prompt).toContain("This is an edit, not a redesign.");
  });

  it("uses the one-concept marker shape the batch parser already reads", () => {
    const prompt = composeEditPrompt({ userPrompt: "tighten the spacing", currentHtml });

    expect(prompt).toContain("DETAILS:");
    expect(prompt).toContain("TITLE_1:");
    expect(prompt).toContain("HTML_1:");
    // A second block would make the parser expect concepts that never arrive.
    expect(prompt).not.toContain("TITLE_2:");

    const parsed = parseBatchWireOutput(
      `DETAILS:\nTightened it.\n\nTITLE_1:\nAerial\n\nHTML_1:\n${currentHtml}`,
      1,
    );
    expect(parsed.htmlByIndex[0]).toContain("the original screen");
  });

  it("queues an edit as a single output written back to the chosen page", () => {
    const route = read("app/api/projects/[projectId]/concepts/route.ts");

    // One revision, never a batch, when a page is named.
    expect(route).toContain("targetPage ? 1 : clampConceptCount");
    expect(route).toContain("composeEditPrompt");
    // Ownership is checked before the page's HTML is put into a prompt.
    expect(route).toContain("getProjectPageForUser");
    expect(route).toContain('{ error: "Page not found." }');
  });

  it("queues one job per concept so pages land one by one", () => {
    const route = read("app/api/projects/[projectId]/concepts/route.ts");

    // The count falls through body, prose, then the default, and each concept
    // becomes its own job carrying a single direction hint.
    expect(route).toContain("resolveRequestedConceptCount");
    expect(route).toContain("CONCEPT_DIRECTIONS");
    expect(route).toContain("variantCount: 1");
    expect(route).toContain("conceptCount: 1");
  });

  it("caps the drift a runaway reply can add to a one-concept job", () => {
    const persist = read("lib/opencode/persistConcepts.ts");
    expect(persist).toContain("Math.min(htmlByIndex.length, expectedCount)");
  });

  it("keeps the page's existing name when revising it", () => {
    const persist = read("lib/opencode/persistConcepts.ts");
    expect(persist).toContain("...(isEdit ? {} : { title })");
  });

  it("sends no target for the all-pages and new-page sentinels", () => {
    const sidebar = read("components/WirePromptSidebar.tsx");
    expect(sidebar).toContain("isAllPagesPromptTarget(selectedPageId) || isNewPagePromptTarget(selectedPageId)");
  });
});

describe("project titles without a title model", () => {
  // opencode runs locally, so there is no server-side call to name the project.
  // Every local-agent project gets this title.
  it("does not end mid-phrase", () => {
    expect(
      fallbackTitleFromPrompt(
        "A pricing page for a note-taking app with a monthly and yearly toggle",
      ),
    ).toBe("Pricing page for a note-taking app");
  });

  it("backs out of a phrase the word limit cut into", () => {
    // Without this the title reads "Habit tracker dashboard with a weekly".
    expect(
      fallbackTitleFromPrompt(
        "Design a habit tracker dashboard with a weekly streak grid and a stats summary",
      ),
    ).toBe("Habit tracker dashboard");
  });

  it("keeps a phrase that ends exactly on the limit", () => {
    // The dropped word starts a new phrase, so the cut is already clean.
    expect(
      fallbackTitleFromPrompt("A pricing page for a note-taking app with a yearly toggle"),
    ).toBe("Pricing page for a note-taking app");
  });

  it("keeps hyphenated words whole", () => {
    expect(fallbackTitleFromPrompt("A two-chair barbershop booking page")).toBe(
      "Two-chair barbershop booking page",
    );
  });

  it("drops the instruction lead-in", () => {
    expect(fallbackTitleFromPrompt("Design a landing page for plants")).toBe(
      "Landing page for plants",
    );
    expect(fallbackTitleFromPrompt("please build me the checkout flow")).toBe(
      "Checkout flow",
    );
  });

  it("falls back rather than returning an empty title", () => {
    expect(fallbackTitleFromPrompt("   ")).toBe("Untitled Project");
    expect(fallbackTitleFromPrompt("!!!")).toBe("Untitled Project");
  });

  it("never strips a prompt down to nothing", () => {
    // A prompt that is only stopwords still has to produce something.
    expect(fallbackTitleFromPrompt("the")).toBe("Untitled Project");
    expect(fallbackTitleFromPrompt("a dashboard")).toBe("Dashboard");
  });
});

describe("idle cost of a connected agent", () => {
  // A serverless request is billed for as long as it stays open, so holding the
  // claim endpoint meant an idle agent cost a full day of function time a day.
  it("answers the claim immediately instead of parking the request", () => {
    const route = read("app/api/agent/jobs/next/route.ts");

    expect(route).not.toContain("LONG_POLL_MS");
    // One claim, not a loop retrying until a deadline.
    expect(route).not.toMatch(/while \(|do \{|for \(/);
    expect(route).toContain("const job = await claimNextAgentJob(user.id);");

    // The only wait left is the legacy-client pause, and it must stay behind
    // the version check rather than becoming an unconditional delay.
    const waits = route.match(/await sleep\(/g) ?? [];
    expect(waits.length).toBe(1);
    const guard = route.indexOf('request.headers.get("x-wirely-agent-version")');
    expect(guard).toBeGreaterThan(-1);
    expect(route.indexOf("await sleep(")).toBeGreaterThan(guard);
  });

  it("keeps the claim handler's budget small", () => {
    const route = read("app/api/agent/jobs/next/route.ts");
    const maxDuration = Number(/maxDuration = (\d+)/.exec(route)?.[1]);

    // One query and a response. A large budget here only hides a regression.
    expect(maxDuration).toBeLessThanOrEqual(10);
  });

  it("speeds up during a session and slows down when left running", () => {
    expect(resolvePollDelayMs(0)).toBe(ACTIVE_POLL_MS);
    expect(resolvePollDelayMs(ACTIVE_WINDOW_MS)).toBe(ACTIVE_POLL_MS);
    expect(resolvePollDelayMs(ACTIVE_WINDOW_MS + 1)).toBe(IDLE_POLL_MS);
    expect(resolvePollDelayMs(IDLE_WINDOW_MS + 1)).toBe(DORMANT_POLL_MS);
    // Monotonic: waiting longer never polls harder.
    expect(ACTIVE_POLL_MS).toBeLessThanOrEqual(IDLE_POLL_MS);
    expect(IDLE_POLL_MS).toBeLessThanOrEqual(DORMANT_POLL_MS);
  });

  it("never polls slower than the window that marks an agent online", () => {
    const onlineWindow = Number(
      /ONLINE_WINDOW_MS = ([\d_]+)/
        .exec(read("lib/db/queries/localAgent.ts"))?.[1]
        ?.replace(/_/g, ""),
    );

    // Two missed polls must still fit, or a running agent flickers offline and
    // the composer refuses to queue against it.
    expect(DORMANT_POLL_MS * 2).toBeLessThan(onlineWindow);
  });

  it("keeps an agent that predates pacing from spinning", () => {
    const route = read("app/api/agent/jobs/next/route.ts");
    const agent = read("agent/wirely-agent.ts");

    // Old agents had no sleep of their own, so an instant 204 would hot loop.
    expect(route).toContain('request.headers.get("x-wirely-agent-version")');
    expect(route).toContain("LEGACY_AGENT_PAUSE_MS");
    expect(agent).toContain('"x-wirely-agent-version": AGENT_VERSION');
  });

  it("ships the version it reports", () => {
    const agent = read("agent/wirely-agent.ts");
    const pkg = JSON.parse(read("agent/package.json")) as { version: string };

    expect(/AGENT_VERSION = "([^"]+)"/.exec(agent)?.[1]).toBe(pkg.version);
  });

  it("does not turn every poll into a database write", () => {
    const auth = read("lib/auth/apiToken.ts");
    const online = read("lib/db/queries/localAgent.ts");

    const touch = Number(
      /TOKEN_TOUCH_INTERVAL_MS = ([\d_]+)/.exec(auth)?.[1]?.replace(/_/g, ""),
    );
    const onlineWindow = Number(
      /ONLINE_WINDOW_MS = ([\d_]+)/.exec(online)?.[1]?.replace(/_/g, ""),
    );

    // Refreshed often enough to stay "online", rarely enough that a fast poll
    // is a read. A write on every poll keeps a suspending database awake.
    expect(touch).toBeGreaterThan(ACTIVE_POLL_MS);
    expect(touch).toBeLessThan(onlineWindow);
    // A dormant poll still has to refresh it, or the agent reads as offline.
    expect(touch).toBeGreaterThanOrEqual(DORMANT_POLL_MS);
    expect(auth).toContain("if (Date.now() - lastUsed > TOKEN_TOUCH_INTERVAL_MS)");
  });

  it("does not let a hung server stall the loop", () => {
    const agent = read("agent/wirely-agent.ts");
    expect(agent).toContain("AbortSignal.timeout(CLAIM_TIMEOUT_MS)");
  });
});
