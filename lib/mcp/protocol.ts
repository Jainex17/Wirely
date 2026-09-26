/**
 * The wire protocol for Wirely's MCP endpoint, hand-rolled on purpose.
 *
 * The server is stateless: every POST carries one complete JSON-RPC message and
 * gets one JSON body back. There is no SSE channel, no session id, and nothing
 * stored between requests, which is the only shape a serverless function can
 * hold. That leaves four methods to implement, well under the size where the
 * MCP SDK and its long-lived Node-server assumptions pay for themselves.
 *
 * This module stays pure: no database, no network. `lib/mcp/tools.ts` holds the
 * handlers and `app/api/mcp/route.ts` holds the transport.
 */

export const MCP_SERVER_NAME = "wirely";
export const MCP_SERVER_VERSION = "1.0.0";

export const LATEST_PROTOCOL_VERSION = "2025-06-18";

/**
 * Sent in the initialize result, which clients load into the agent's context.
 * Each line answers a mistake seen in a real session: five states of one
 * layout handed over as "designs to pick from", and a project the user was
 * never given a link to.
 */
export const MCP_INSTRUCTIONS = [
  "Wirely is a canvas the user watches live while you write pages.",
  "After create_project, give the user the editor URL it returns.",
  "When the user asks for several designs or options, make each one a different layout " +
    "direction: a different structure, hierarchy, and way of showing the data. The same " +
    "layout in different states is not a set of options. Say which kind you made in each " +
    "page title.",
  "When a page is finished, call get_page_png with lint: true once to check it. Each image " +
    "costs about 1,500 tokens, so skip it after small text or color patches.",
].join("\n");

/** Versions a client may negotiate, including the two before the current spec. */
const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"];

export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export type RpcId = string | number | null;

export type RpcMessage =
  | { kind: "request"; id: RpcId; method: string; params: Record<string, unknown> }
  | { kind: "notification"; method: string; params: Record<string, unknown> };

export type ParsedRpc =
  | { ok: true; message: RpcMessage }
  | { ok: false; code: number; message: string };

const asParams = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Validates one inbound JSON-RPC message. A message without an `id` is a
 * notification and gets no response body, only a 202.
 */
export const parseRpcMessage = (raw: unknown): ParsedRpc => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: RPC_INVALID_REQUEST,
      message: "Expected a single JSON-RPC 2.0 message object.",
    };
  }

  const record = raw as Record<string, unknown>;
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string") {
    return {
      ok: false,
      code: RPC_INVALID_REQUEST,
      message: 'Expected jsonrpc "2.0" and a string method.',
    };
  }

  const params = asParams(record.params);

  if ("id" in record) {
    const id = record.id;
    if (id !== null && typeof id !== "string" && typeof id !== "number") {
      return {
        ok: false,
        code: RPC_INVALID_REQUEST,
        message: "The id must be a string, a number, or null.",
      };
    }
    return { ok: true, message: { kind: "request", id, method: record.method, params } };
  }

  return { ok: true, message: { kind: "notification", method: record.method, params } };
};

/** Echoes a version the client asked for when it is one we speak. */
export const negotiateProtocolVersion = (requested: unknown): string =>
  typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  /** Base64-encoded PNG. */
  data: string;
  mimeType: string;
}

export type ToolContent = TextContent | ImageContent;

export interface ToolCallResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for `arguments`, reported verbatim by `tools/list`. */
  inputSchema: Record<string, unknown>;
}

const idProperty = (description: string) => ({ type: "string", description });
const PROJECT_ID = idProperty("A project id from list_projects or create_project.");
const PAGE_ID = idProperty("A page id from list_pages, add_page, or create_project.");

const htmlDescription =
  "One complete, self-contained HTML document. For Tailwind utility classes to " +
  'render, include <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">' +
  "</script> in <head>. The page is a static design mock and is sanitized before " +
  "storage: <button>, <form>, <input>, <select>, and <textarea> are removed together " +
  "with their contents, so draw CTAs as styled <a href=\"#\"> or <div role=\"button\"> " +
  "elements instead, and keep <img> sources on Unsplash hosts. Allowlisted CDN " +
  "scripts (the Tailwind browser build, Tailwind Plus elements, Chart.js) are kept; " +
  "scripts are the page's only way to run code.";

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "list_projects",
    description:
      "List the user's Wirely projects. A project is one design file: a canvas of pages (screens).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_project",
    description:
      "Create a Wirely project. It starts with one empty page named \"Page 1\". " +
      "Returns both ids and the editor URL; give that URL to the user so they can open the project.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Project name, shown on the home page." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "list_pages",
    description:
      "List the pages (screens) in a project with their titles, device types, and " +
      "HTML sizes. Does not return the HTML itself; use get_page for that.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "add_page",
    description:
      "Add a screen to a project, from html or as a copy of an existing page. To make a " +
      "variant of a page, copy it with copyFromPageId and change it with patch_page instead " +
      `of writing the whole document again. ${htmlDescription}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        title: { type: "string", description: "Screen name, shown above the canvas frame." },
        html: { type: "string", description: "The page document. Omit when copying." },
        copyFromPageId: {
          type: "string",
          description: "Start as a copy of this page in the same project. Omit when sending html.",
        },
        deviceType: {
          type: "string",
          enum: ["desktop", "mobile"],
          description: "Defaults to desktop. Mobile frames render at 375px.",
        },
      },
      required: ["projectId", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_page",
    description:
      "Replace a page's whole HTML, rename it, or change its device type. For a change to " +
      "part of a page, patch_page costs far less. HTML follows the add_page rules.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        title: { type: "string", description: "New screen name." },
        html: { type: "string", description: "The new page document." },
        deviceType: { type: "string", enum: ["desktop", "mobile"] },
      },
      required: ["projectId", "pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "patch_page",
    description:
      "Replace one exact snippet of a page's HTML. oldString must occur exactly once in the " +
      "stored source. Use it to write a page in chunks so the user watches it change live on " +
      "the canvas. Copy oldString from the HTML you wrote. If it is not found, the sanitizer " +
      "changed that part, so call get_page for the exact stored text.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        oldString: {
          type: "string",
          description: "Exact text from the page. Include enough context to match once.",
        },
        newString: {
          type: "string",
          description: "Replacement text. May be empty to delete oldString.",
        },
      },
      required: ["projectId", "pageId", "oldString", "newString"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page",
    description: "Return a page's full HTML source so it can be read or revised.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID, pageId: PAGE_ID },
      required: ["projectId", "pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page_png",
    description:
      "Render a page exactly as the Wirely preview does and return a PNG screenshot. " +
      "Use it to look at a screen and iterate on it visually.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        lint: {
          type: "boolean",
          description:
            "Also report horizontal overflow, clipped text, and low contrast text found in the render.",
        },
      },
      required: ["projectId", "pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_page",
    description:
      "Delete a page from a project. The last remaining page cannot be deleted.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID, pageId: PAGE_ID },
      required: ["projectId", "pageId"],
      additionalProperties: false,
    },
  },
];

export const rpcResult = (id: RpcId, result: unknown) => ({
  jsonrpc: "2.0",
  id,
  result,
});

export const rpcError = (id: RpcId, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});
