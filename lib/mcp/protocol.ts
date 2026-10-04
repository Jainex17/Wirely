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

import { PAPER_SHADERS_MODULE_URL } from "@/lib/iframeSecurity";

export const MCP_SERVER_NAME = "wirely";
export const MCP_SERVER_VERSION = "1.0.0";

export const LATEST_PROTOCOL_VERSION = "2025-06-18";

/**
 * Sent in the initialize result, which clients load into the agent's context.
 * Each line answers a mistake seen in a real session: five states of one
 * layout handed over as "designs to pick from", and a project the user was
 * never given a link to. The motion line matches the canvas, which holds
 * page animations still until Replay. The get_page and get_page_changes lines cover
 * the hand-off from canvas to the user's repo, where a raw HTML paste ignores
 * their stack and the user's own canvas tweaks would otherwise never reach
 * the code. The last line keeps an agent from resending a whole page to move
 * one block.
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
  "A link like /wire/<projectId>?page=<pageId>&node=<nodeId> points at one element the user " +
    "picked. Call get_page with that nodeId, edit only that element with patch_page using the " +
    "returned source as oldString, and keep its data-wirely-id attribute.",
  "Give each page one short entrance animation that plays once. The canvas shows pages " +
    "settled and plays their motion when the user clicks Replay. Never loop an animation.",
  "Keep all content visible without JavaScript. The canvas shows pages with scripts off, so " +
    "never hide content until a script or IntersectionObserver reveals it.",
  "For an icon, logo, illustration, social card, or any artwork that is not a screen, send " +
    "one SVG file as the html of add_page: an <svg> root with xmlns, a viewBox, and width and " +
    "height in px for the artboard size. It becomes a vector page the user can edit with the " +
    "pen tool. Draw it like an illustrator: build back to front in named <g> groups " +
    "(silhouette, shadow shapes, highlights, then linework); shape organic forms with cubic " +
    "curves, anchors at the extremes, never polygons; give each hue a base, shadow, and " +
    "highlight tone or a gradient; keep one outline weight with round joins and thinner " +
    "detail lines; reuse repeated parts with <use>. Match the style asked for (flat, " +
    "isometric, engraving with hatching, botanical). Use <path> for shapes, one decimal per " +
    "coordinate, and no scripts. Check it with get_page_png.",
  "When the user asks you to address or fix the comments on a project, call list_comments. For " +
    "each one, read what it points at (get_page with the comment's nodeId when it has one, " +
    "otherwise get_page_png to see the pin), make the change, then call resolve_comment. " +
    "Leave a comment open if you could not do what it asks, and tell the user why.",
  "When the user says \"this\", \"the selected\", or \"what I picked\" without a link, call " +
    "get_selection to find the page and element they have selected on the canvas.",
  "When you design for a codebase that has design tokens (CSS variables, a Tailwind theme, a " +
    "tokens file), read them and call set_design_tokens before writing pages. Then use " +
    "var(--name) in CSS or Tailwind's bg-(--name) syntax instead of hard-coded values.",
  "To redesign an existing site, import_url brings its current page onto the canvas as a " +
    "starting point. Copy it with add_page copyFromPageId before changing it, so the original stays.",
  "When the user asks you to build a page they picked in their own codebase, call get_page " +
    "and treat its HTML as the visual spec: rebuild it with the project's own framework, " +
    "components, and styles instead of pasting the HTML in.",
  "When the user says they tweaked a page on the canvas and wants those tweaks in their code, " +
    "call get_page_changes and apply only the listed differences to the matching components.",
  "For structural changes (reorder, duplicate, delete, hide, wrap in a frame, insert a block), " +
    "call get_page_outline for node ids and use edit_element instead of rewriting the page.",
  "For a shader background (mesh gradient, grain, dithering, and others), import Paper " +
    "Shaders in an inline <script type=\"module\">: import { ShaderMount, " +
    "meshGradientFragmentShader, getShaderColorFromString } from " +
    `"${PAPER_SHADERS_MODULE_URL}". It is the only module a page can import. Mount it ` +
    "still, with speed 0 and frame 0: new ShaderMount(el, meshGradientFragmentShader, { " +
    "u_colors: [\"#0b1020\", \"#4f46e5\", \"#ec4899\"].map(getShaderColorFromString), " +
    "u_colorsCount: 3, u_distortion: 0.8, u_swirl: 0.1, u_grainMixer: 0, u_grainOverlay: 0, " +
    "u_fit: 2, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, " +
    "u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 }, undefined, 0, 0). Give the element " +
    "a CSS background too: get_page_png has no WebGL and shows only that.",
  "For a multi-screen flow, call get_design_tokens first and write one nav block that every " +
    "screen reuses with the same links in the same order. When the screens are done, call " +
    "set_prototype_flow with them in order, and fix any navigation mismatch it reports.",
  "Pass a short note with each change (add_page, update_page, patch_page, edit_element, " +
    "delete_page, set_design_tokens) saying what it does. The user follows your work by these notes.",
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
const NOTE = {
  type: "string",
  description:
    "One short sentence on what this change does, in plain words, like \"Tighten the hero " +
    "spacing\". The user reads it in the editor's activity list.",
};

const htmlDescription =
  "One complete, self-contained HTML document. For Tailwind utility classes to " +
  'render, include <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">' +
  "</script> in <head>. The page is a static design mock and is sanitized before " +
  "storage: <button>, <form>, <input>, <select>, and <textarea> are removed together " +
  "with their contents, so draw CTAs as styled <a href=\"#\"> or <div role=\"button\"> " +
  "elements instead, and keep <img> sources on Unsplash hosts or project images from " +
  "add_asset and list_assets. Allowlisted CDN " +
  "scripts (the Tailwind browser build, Tailwind Plus elements, Chart.js) are kept, and an " +
  "inline module may import Paper Shaders; " +
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
          enum: ["desktop", "mobile", "vector"],
          description:
            "Defaults to desktop. Mobile frames render at 375px. Vector is an SVG artboard " +
            "framed at the SVG's own width and height, and is picked for you when html is an SVG file.",
        },
        note: NOTE,
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
        deviceType: { type: "string", enum: ["desktop", "mobile", "vector"] },
        note: NOTE,
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
        note: NOTE,
      },
      required: ["projectId", "pageId", "oldString", "newString"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page",
    description:
      "Return a page's full HTML source so it can be read or revised, or with nodeId just " +
      "one element's exact source, ready to use as patch_page's oldString.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        nodeId: {
          type: "string",
          description: "The node value from a Wirely element link. Returns only that element.",
        },
      },
      required: ["projectId", "pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page_outline",
    description:
      "Return a page's element tree as an indented outline: tag, node id, and text or label " +
      "per line. Far smaller than get_page, so use it to find elements and plan structural " +
      "edits on a long page before reading or patching source.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID, pageId: PAGE_ID },
      required: ["projectId", "pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_element",
    description:
      "Change a page's structure by node id without resending HTML: move an element before, " +
      "after, or inside another; duplicate, delete, hide, or show it; wrap it in a new flex " +
      "frame; or insert new HTML before, after, or inside it. The user sees the change live. " +
      "Duplicate, wrap, and insert return the new element's id.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        action: {
          type: "string",
          enum: ["move", "duplicate", "delete", "wrap", "hide", "show", "insert"],
        },
        nodeId: {
          type: "string",
          description: "The element to act on. For insert, the element the new HTML goes next to or into.",
        },
        targetId: {
          type: "string",
          description: "For move: the element to move next to or into.",
        },
        position: {
          type: "string",
          enum: ["before", "after", "inside"],
          description: "For move and insert. inside appends as the last child.",
        },
        html: {
          type: "string",
          description: "For insert: the HTML to add. Sanitized like any page write.",
        },
        note: NOTE,
      },
      required: ["projectId", "pageId", "action", "nodeId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page_changes",
    description:
      "List the elements the user changed by hand on the canvas since your last write to the " +
      "page (text, colors, sizes, spacing, pen edits), with each element's opening tag and " +
      "text before and after. Use it to carry the user's canvas edits into their codebase " +
      "without rereading the whole page. Calling it marks the changes seen.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
      },
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
    name: "list_comments",
    description:
      "List the comments pinned on a project's pages, by the owner in the editor or by " +
      "reviewers through the review link. A comment with a nodeId is about that one element: " +
      "pass it to get_page to read its exact source. Each has the page, author, text, and pin " +
      "position in page pixels at the page's design " +
      "width (desktop 1440, mobile 375, vector the artboard's width), so call get_page_png to see what a pin points at. " +
      "Use it when the user asks you to address feedback. Returns open comments unless " +
      "includeResolved is true.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageId: { ...PAGE_ID, description: "Only comments on this page. Omit for every page." },
        includeResolved: {
          type: "boolean",
          description: "Also return comments the owner already resolved.",
        },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "resolve_comment",
    description:
      "Mark a comment done after you made the change it asks for, so it leaves the canvas. " +
      "Set resolved to false to reopen one.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        commentId: { type: "string", description: "A comment id from list_comments." },
        resolved: { type: "boolean", description: "Defaults to true." },
      },
      required: ["projectId", "commentId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_selection",
    description:
      "Return the page and element the user most recently selected on the Wirely canvas, " +
      "with the element's exact HTML, ready to use as patch_page's oldString. Without " +
      "projectId it returns the latest selection across all of the user's projects.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { ...PROJECT_ID, description: "Only this project. Omit for the latest anywhere." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_design_tokens",
    description:
      "Return the project's design tokens: CSS custom properties Wirely writes into every page.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "set_design_tokens",
    description:
      "Replace the project's design tokens. Wirely writes them as a :root block into every " +
      "existing and future page, so pages that use var(--name) all update together. Send an " +
      "empty object to remove them. Mirror the names from the user's codebase.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        tokens: {
          type: "object",
          description:
            'Custom property names to plain CSS values, e.g. { "--color-primary": "#4f46e5", ' +
            '"--radius-md": "8px", "--font-sans": "Inter, sans-serif" }. Values cannot contain ' +
            "< > { } ; or \\.",
          additionalProperties: { type: "string" },
        },
        note: NOTE,
      },
      required: ["projectId", "tokens"],
      additionalProperties: false,
    },
  },
  {
    name: "import_url",
    description:
      "Load a public web page in a headless browser and add it to the project as a static " +
      "page: its rendered HTML with its CSS inlined. Scripts are dropped, form controls " +
      "become styled divs, and images and artwork too large to keep become gray boxes. Use " +
      "it to start a redesign from the user's live site. Takes up to about 30 seconds.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        url: { type: "string", description: "A public http or https URL." },
        title: { type: "string", description: "Screen name. Defaults to the page's own title." },
        deviceType: {
          type: "string",
          enum: ["desktop", "mobile"],
          description: "The viewport the page is loaded at. Defaults to desktop.",
        },
      },
      required: ["projectId", "url"],
      additionalProperties: false,
    },
  },
  {
    name: "add_asset",
    description:
      "Get a 15 minute link to upload an image from the user's disk into the project, for " +
      "when they ask you to use a local image in a design. Returns a curl command; run it " +
      "and use the src it prints.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_assets",
    description: "List the project's uploaded images with the src to use in a page.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_page",
    description:
      "Delete a page from a project. The last remaining page cannot be deleted.",
    inputSchema: {
      type: "object",
      properties: { projectId: PROJECT_ID, pageId: PAGE_ID, note: NOTE },
      required: ["projectId", "pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "set_prototype_flow",
    description:
      "Link screens into the project's clickable prototype, in the order a viewer steps " +
      "through them. Pages left out are not in the prototype, so call it again with a " +
      "different list to add or remove screens. Returns the prototype link to give the " +
      "user, and lists screens whose <nav> links differ from the other screens of the " +
      "same device type.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID,
        pageIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 50,
          description: "Page ids in prototype order, with no repeats.",
        },
        startPageId: {
          type: "string",
          description: "The screen the prototype opens on. Defaults to the first of pageIds.",
        },
        note: NOTE,
      },
      required: ["projectId", "pageIds"],
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
