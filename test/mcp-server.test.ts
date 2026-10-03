import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

import {
  LATEST_PROTOCOL_VERSION,
  MCP_TOOLS,
  RPC_INVALID_REQUEST,
  negotiateProtocolVersion,
  parseRpcMessage,
  rpcError,
  rpcResult,
} from "@/lib/mcp/protocol";
import {
  CATALOG_TOOL_NAMES,
  TOOL_NAMES,
  callTool,
  replaceExactlyOnce,
} from "@/lib/mcp/tools";
import {
  buildConnectSnippet,
  MCP_CLIENTS,
} from "@/lib/mcp/connectSnippet";

const read = (path: string) => readFileSync(path, "utf8");

describe("json-rpc parsing", () => {
  it("reads a request and echoes its id", () => {
    const parsed = parseRpcMessage({ jsonrpc: "2.0", id: 7, method: "tools/list" });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.message.kind !== "request") throw new Error("expected a request");
    expect(parsed.message.id).toBe(7);
    expect(parsed.message.method).toBe("tools/list");
    expect(parsed.message.params).toEqual({});
  });

  it("reads string, number, and null ids", () => {
    for (const id of ["abc", 0, null]) {
      const parsed = parseRpcMessage({ jsonrpc: "2.0", id, method: "ping" });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok || parsed.message.kind !== "request") throw new Error("expected a request");
      expect(parsed.message.id).toBe(id);
    }
  });

  it("treats a message without an id as a notification", () => {
    const parsed = parseRpcMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected ok");
    expect(parsed.message.kind).toBe("notification");
  });

  it("rejects anything that is not one message object", () => {
    expect(parseRpcMessage([1, 2])).toMatchObject({ ok: false, code: RPC_INVALID_REQUEST });
    expect(parseRpcMessage("hello")).toMatchObject({ ok: false });
    expect(parseRpcMessage(null)).toMatchObject({ ok: false });
    expect(parseRpcMessage({ method: "ping" })).toMatchObject({ ok: false });
    expect(parseRpcMessage({ jsonrpc: "1.0", id: 1, method: "ping" })).toMatchObject({
      ok: false,
    });
    expect(parseRpcMessage({ jsonrpc: "2.0", id: true, method: "ping" })).toMatchObject({
      ok: false,
    });
  });

  it("collects params when present and ignores them when malformed", () => {
    const parsed = parseRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_page", junk: true },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected ok");
    expect(parsed.message.params).toEqual({ name: "get_page", junk: true });
    expect(parseRpcMessage({ jsonrpc: "2.0", id: 1, method: "ping", params: 4 })).toMatchObject({
      ok: true,
    });
  });
});

describe("protocol version negotiation", () => {
  it("echoes a version the server speaks", () => {
    expect(negotiateProtocolVersion("2025-03-26")).toBe("2025-03-26");
    expect(negotiateProtocolVersion(LATEST_PROTOCOL_VERSION)).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("answers unknown and missing versions with the latest", () => {
    expect(negotiateProtocolVersion("1999-01-01")).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(42)).toBe(LATEST_PROTOCOL_VERSION);
  });
});

describe("rpc envelopes", () => {
  it("wraps results and errors", () => {
    expect(rpcResult(3, { ok: true })).toEqual({ jsonrpc: "2.0", id: 3, result: { ok: true } });
    expect(rpcError(null, -32601, "nope")).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32601, message: "nope" },
    });
  });
});

describe("tool catalog", () => {
  it("keeps the listed tools and the dispatch table identical", () => {
    expect(TOOL_NAMES).toEqual(CATALOG_TOOL_NAMES);
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it("carries every screen tool an agent needs", () => {
    expect(TOOL_NAMES).toEqual([
      "add_asset",
      "add_page",
      "create_project",
      "delete_page",
      "edit_element",
      "get_design_tokens",
      "get_page",
      "get_page_changes",
      "get_page_outline",
      "get_page_png",
      "get_selection",
      "import_url",
      "list_assets",
      "list_comments",
      "list_pages",
      "list_projects",
      "patch_page",
      "resolve_comment",
      "set_design_tokens",
      "set_prototype_flow",
      "update_page",
    ]);
  });

  it("describes each tool as a JSON-Schema object", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("tells the agent how to make Tailwind render", () => {
    // Without the CDN script tag, every page an agent writes previews unstyled.
    const addPage = MCP_TOOLS.find((tool) => tool.name === "add_page");
    expect(addPage?.description).toContain("@tailwindcss/browser@4");
    expect(addPage?.description).toContain("sanitized");
  });

  it("warns the agent off elements the sanitizer deletes", () => {
    // A sanitized page drops <button> with its contents; an agent that was not
    // warned ships a design missing its CTA and never learns why.
    const addPage = MCP_TOOLS.find((tool) => tool.name === "add_page");
    expect(addPage?.description).toContain("<button>");
    expect(addPage?.description).toContain('role="button"');
  });
});

describe("tool dispatch", () => {
  it("rejects an unknown tool with a pointer to tools/list", async () => {
    const result = await callTool("user", "deploy_to_production", {}, "https://wirely.test");

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("tools/list"),
    });
  });

  it("rejects arguments that name nothing to change", async () => {
    const result = await callTool("user", "update_page", { projectId: "p", pageId: "q" }, "https://wirely.test");

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Provide html, title, or deviceType"),
    });
  });

  it("rejects oversized html before reaching the database", async () => {
    const result = await callTool("user", "add_page", {
      projectId: "p",
      title: "Too big",
      html: "x".repeat(600_000),
    }, "https://wirely.test");

    expect(result.isError).toBe(true);
  });

  it("rejects an empty oldString before reaching the database", async () => {
    const result = await callTool("user", "patch_page", {
      projectId: "p",
      pageId: "q",
      oldString: "",
      newString: "x",
    }, "https://wirely.test");

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("oldString"),
    });
  });
});

describe("replaceExactlyOnce", () => {
  it("reports zero matches", () => {
    expect(replaceExactlyOnce("<p>Hi</p>", "Bye", "Yo")).toEqual({ ok: false, matches: 0 });
  });

  it("splices a single match", () => {
    expect(replaceExactlyOnce("<p>Hi</p><p>Yo</p>", "Hi", "Hello")).toEqual({
      ok: true,
      html: "<p>Hello</p><p>Yo</p>",
    });
    expect(replaceExactlyOnce("<p>Hi</p>", "<p>Hi</p>", "")).toEqual({ ok: true, html: "" });
  });

  it("counts every match, overlapping ones included", () => {
    expect(replaceExactlyOnce("<li>a</li><li>b</li><li>c</li>", "<li>", "<li class=x>")).toEqual({
      ok: false,
      matches: 3,
    });
    expect(replaceExactlyOnce("aaa", "aa", "b")).toEqual({ ok: false, matches: 2 });
  });

  it("inserts dollar patterns literally", () => {
    expect(replaceExactlyOnce("<p>PRICE</p>", "PRICE", "$& $1 $$9")).toEqual({
      ok: true,
      html: "<p>$& $1 $$9</p>",
    });
  });
});

describe("mcp route boundary", () => {
  const route = read("app/api/mcp/route.ts");

  it("authenticates with a token, never a Clerk session", () => {
    expect(route.includes("authenticateAgentRequest")).toBe(true);
    expect(route.includes("Unauthenticated")).toBe(true);
    expect(route.includes("getRequestSessionUser")).toBe(false);
  });

  it("keeps the runtime contract", () => {
    expect(route.includes('runtime = "nodejs"')).toBe(true);
    expect(route.includes('dynamic = "force-dynamic"')).toBe(true);
    expect(route.includes("maxDuration = 60")).toBe(true);
  });

  it("bounds the request body like the agent result route", () => {
    expect(route.includes("readJsonBodyWithLimit")).toBe(true);
    expect(route.includes("MCP_BODY_MAX_BYTES")).toBe(true);
  });

  it("answers nothing on GET or DELETE", () => {
    expect(route).toContain("405");
    expect(route).toContain('Allow: "POST"');
  });
});

describe("screenshot deploy config", () => {
  const config = read("next.config.ts");

  it("ships the chromium binaries the file tracer cannot see", () => {
    // @sparticuz/chromium resolves bin/ at runtime from import.meta.url, so
    // Vercel's tracer skips the .br archives and get_page_png fails only in
    // production without this entry.
    expect(config.includes("outputFileTracingIncludes")).toBe(true);
    expect(config.includes("@sparticuz/chromium/bin")).toBe(true);
    expect(config.includes('"/api/mcp"')).toBe(true);
  });
});

describe("html sanitizer boundary", () => {
  it("sanitizes before either write path persists", () => {
    const tools = read("lib/mcp/tools.ts");
    // prepareHtml marks a vector artboard, then sanitizes, for both writes.
    expect(tools).toContain(
      'sanitizeIframeHtml(deviceType === "vector" ? prepareArtboardHtml(html) : html)',
    );
    const addSanitized = tools.indexOf("prepareHtml(sentHtml, deviceType)");
    const created = tools.indexOf("createProjectPageForUser({", addSanitized);
    const updateSanitized = tools.indexOf("prepareHtml(parsed.data.html, deviceType)");
    const updated = tools.indexOf("updateProjectPageForUser({", updateSanitized);

    expect(addSanitized).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(addSanitized);
    expect(updateSanitized).toBeGreaterThan(-1);
    expect(updated).toBeGreaterThan(updateSanitized);
  });

  it("sanitizes a patched page before saving it", () => {
    const tools = read("lib/mcp/tools.ts");
    const sanitized = tools.indexOf("sanitizeIframeHtml(patch.html)");
    const saved = tools.indexOf("updateProjectPageForUser({", sanitized);

    expect(sanitized).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(sanitized);
  });
});

describe("protocol purity", () => {
  it("keeps the protocol module free of database and network code", () => {
    const source = read("lib/mcp/protocol.ts");

    expect(source.includes("@/lib/db")).toBe(false);
    expect(source.includes("fetch(")).toBe(false);
  });
});

describe("oauth connect boundary", () => {
  it("consumes the code and verifies PKCE before any token is issued", () => {
    const source = read("app/api/mcp/oauth/token/route.ts");
    const consume = source.indexOf("consumeAuthorizationCode(");
    const pkce = source.indexOf("verifierMatchesChallenge(");
    const issue = source.indexOf("createApiToken(");

    expect(consume).toBeGreaterThan(-1);
    expect(pkce).toBeGreaterThan(-1);
    expect(issue).toBeGreaterThan(consume);
    expect(issue).toBeGreaterThan(pkce);
  });

  it("matches the redirect URI exactly on both authorize steps and never redirects on failure", () => {
    for (const path of [
      "app/mcp/authorize/page.tsx",
      "app/api/mcp/oauth/authorize/route.ts",
    ]) {
      const source = read(path);
      const validates = source.indexOf("validateRedirectUri(");
      const matches = source.indexOf(".includes(parsed.value.redirectUri)");
      const errors = source.indexOf("renderError");

      expect(validates).toBeGreaterThan(-1);
      expect(matches).toBeGreaterThan(validates);
      expect(errors).toBeGreaterThan(-1);
    }
  });

  it("challenges clients toward the discovery document on 401", () => {
    const source = read("app/api/mcp/route.ts");

    expect(source.includes("resource_metadata=")).toBe(true);
    expect(source.includes(".well-known/oauth-protected-resource")).toBe(true);
  });
});

describe("client connect snippets", () => {
  const URL = "https://wirely.vercel.app/api/mcp";
  const TOKEN = "wirely_abc123";

  it("gives every client an OAuth snippet with no token and a browser step", () => {
    for (const client of MCP_CLIENTS) {
      const steps = buildConnectSnippet(client.id, URL);

      expect(steps.snippet).toContain(URL);
      expect(steps.snippet).not.toContain("Bearer");
      expect(steps.target.length).toBeGreaterThan(0);
      expect(steps.next).toMatch(/authoriz/i);
    }
  });

  it("puts the token in a bearer header for every client when one is given", () => {
    for (const client of MCP_CLIENTS) {
      const steps = buildConnectSnippet(client.id, URL, TOKEN);

      expect(steps.snippet).toContain(URL);
      expect(steps.snippet).toContain(`Bearer ${TOKEN}`);
      expect(steps.next).not.toMatch(/authoriz/i);
    }
  });

  it("gives each client its own install command", () => {
    expect(buildConnectSnippet("claude-code", URL, TOKEN).snippet).toBe(
      `claude mcp add --transport http wirely ${URL} --header "Authorization: Bearer ${TOKEN}" --scope user`,
    );
    expect(buildConnectSnippet("codex", URL).snippet).toBe(
      `codex mcp add wirely --url ${URL} && codex mcp login wirely`,
    );
    expect(buildConnectSnippet("codex", URL, TOKEN).snippet).toContain(
      `http_headers = { "Authorization" = "Bearer ${TOKEN}" }`,
    );
    expect(buildConnectSnippet("opencode", URL).snippet).toBe(
      `opencode mcp add wirely --url ${URL} --global && opencode mcp auth wirely`,
    );
  });

  it("gives Cursor an install link that decodes to its server config", () => {
    for (const token of [undefined, TOKEN]) {
      const steps = buildConnectSnippet("cursor", URL, token);
      const link = new globalThis.URL(steps.installUrl ?? "");
      const config = JSON.parse(atob(link.searchParams.get("config") ?? ""));

      expect(link.protocol).toBe("cursor:");
      expect(link.searchParams.get("name")).toBe("wirely");
      expect(config.url).toBe(URL);
      expect(config.headers?.Authorization).toBe(token ? `Bearer ${token}` : undefined);
    }
    expect(buildConnectSnippet("claude-code", URL).installUrl).toBeUndefined();
  });

  it("refuses to build a snippet without the pieces it needs", () => {
    expect(() => buildConnectSnippet("cursor", "")).toThrow();
    expect(() => buildConnectSnippet("cursor", URL, "  ")).toThrow();
  });
});
