/**
 * In-app generation for design projects: a model on the user's own key builds
 * screens with the same tools an MCP agent gets. Every call runs through the
 * MCP design handlers, so each screen saves the moment it is added and shows
 * up in the open editor on its next poll, and a user editing at the same time
 * is never written over.
 *
 * The model sees a short set of tools, since a free model with fewer choices
 * calls them more reliably and each schema costs tokens on the user's key.
 */
import { jsonSchema, tool, type Tool } from "ai";
import { SCREEN_SIZES } from "@/lib/design/document";
import { DESIGN_REFERENCE } from "@/lib/design/tools";
import type { McpToolDefinition, ToolCallResult } from "@/lib/mcp/protocol";

/** The tools in-app generation offers, a subset of the MCP design catalog. */
export const GENERATION_TOOL_NAMES = [
  "add_screen",
  "list_pages",
  "get_page_tree",
  "get_jsx",
  "render",
  "update_node",
  "batch_update",
  "set_fill",
  "set_text",
  "set_layout",
  "delete_node",
  "search_icons",
  "insert_icon",
] as const;

/** One line of the generation route's progress stream, which the editor reads. */
export type DesignGenerationEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "tool-result"; name: string; ok: boolean }
  | { type: "done"; summary: string }
  | { type: "error"; message: string };

/** How far one run may go: a few screens plus fixes, inside the 60 second route limit. */
export const GENERATION_MAX_STEPS = 8;

export const buildGenerationSystemPrompt = () =>
  [
    "You are Wirely's screen designer. You build editable design screens on a canvas by calling design tools, the way a designer works in Figma.",
    `Add each screen with one add_screen call holding the whole screen as design JSX. Use device "desktop" (${SCREEN_SIZES.desktop.width} wide) for web and "mobile" (${SCREEN_SIZES.mobile.width} wide) for phone screens; pick from the request, desktop when it does not say.`,
    "Give the root <Frame> flex=\"col\", padding, and a background, and lay out content with auto layout (flex, gap, padding, w=\"fill\"/\"hug\") rather than absolute positions.",
    "Give text weight as a number like 600, or normal, medium, or bold. Other names render at 400.",
    "Write real, specific content for the product asked for. No lorem ipsum, no placeholder labels.",
    "When the user asks for options, variants, or directions, make two or three screens that differ in layout and hierarchy, not only in color, and name each after its direction, like \"Pricing · Option B · Comparison table\".",
    "To change an existing screen, call list_pages for screen ids and get_jsx to read it, then use render with replace_id for a section, or set_fill, set_text, update_node, and batch_update for small edits. Do not rebuild a whole screen for a small change.",
    "When the screens are done, stop calling tools and reply with one short sentence saying what you made.",
    "",
    DESIGN_REFERENCE,
  ].join("\n");

type RunTool = (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;

const withoutProjectId = (definition: McpToolDefinition) => {
  const { properties = {}, required = [] } = definition.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const { projectId: _projectId, ...rest } = properties;
  void _projectId;
  return {
    type: "object" as const,
    properties: rest,
    required: required.filter((name) => name !== "projectId"),
    additionalProperties: false,
  };
};

/** The text a tool result shows the model. Images are left out; the model cannot use them here. */
export const toolResultText = (result: ToolCallResult) =>
  `${result.isError ? "Error: " : ""}${result.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n")}`;

/**
 * The generation tools as AI SDK tools, each running through `runTool`, which
 * adds the project id and calls the MCP design handler.
 */
export const buildGenerationTools = (catalog: McpToolDefinition[], runTool: RunTool) =>
  Object.fromEntries(
    GENERATION_TOOL_NAMES.flatMap((name) => {
      const definition = catalog.find((entry) => entry.name === name);
      if (!definition) return [];
      return [
        [
          name,
          tool({
            description: definition.description,
            parameters: jsonSchema<Record<string, unknown>>(
              withoutProjectId(definition) as Parameters<typeof jsonSchema>[0],
            ),
            execute: async (args) => toolResultText(await runTool(name, args)),
          }),
        ],
      ];
    }),
  ) as Record<string, Tool>;
