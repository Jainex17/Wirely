/**
 * The design tools an MCP agent or in-app generation uses to build and edit a
 * design project's screens. They are the design engine's own tools, run
 * headless against the project's document, so an agent builds nodes the same
 * way the editor does. Each takes the engine's arguments plus `projectId`.
 *
 * The list is curated: every tool's schema goes into the agent's context on
 * each tools/list, which the user pays for on their own subscription, so tools
 * for niche edits (boolean ops, path surgery, audits) and for an app UI the
 * server does not have (selection, viewport, pages) are left out.
 */
import { JSX_REFERENCE } from "@open-pencil/core/design-jsx";
import { FigmaAPI } from "@open-pencil/core/figma-api";
import { ALL_TOOLS, type ToolDef } from "@open-pencil/core/tools";
import type { SceneGraph } from "@open-pencil/scene-graph";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { McpToolDefinition } from "@/lib/mcp/protocol";

export const DESIGN_TOOL_NAMES = [
  // Read
  "get_jsx",
  "get_node",
  "find_nodes",
  "query_nodes",
  "get_page_tree",
  "node_tree",
  "node_children",
  "node_bounds",
  "describe",
  "diff_jsx",
  "get_components",
  "list_variables",
  "list_collections",
  "list_available_fonts",
  "search_icons",
  // Build
  "render",
  "create_shape",
  "create_vector",
  "import_svg",
  "insert_icon",
  "create_component",
  "create_instance",
  "clone_node",
  // Edit
  "update_node",
  "batch_update",
  "set_layout",
  "set_layout_child",
  "set_fill",
  "set_image_fill",
  "set_stroke",
  "set_radius",
  "set_effects",
  "set_opacity",
  "set_text",
  "set_text_properties",
  "set_font",
  "set_visible",
  "set_constraints",
  "set_minmax",
  "node_resize",
  "node_move",
  "reparent_node",
  "rename_node",
  "group_nodes",
  "ungroup_node",
  "arrange",
  "delete_node",
  // Tokens
  "create_collection",
  "create_variable",
  "set_variable",
  "bind_variable",
] as const;

export type DesignToolName = (typeof DESIGN_TOOL_NAMES)[number];

const toolsByName = new Map<string, ToolDef>(ALL_TOOLS.map((tool) => [tool.name, tool]));

export const getDesignTool = (name: string) =>
  (DESIGN_TOOL_NAMES as readonly string[]).includes(name) ? (toolsByName.get(name) ?? null) : null;

export const isDesignToolName = (name: string): name is DesignToolName => getDesignTool(name) !== null;

// The converter writes Number.MAX_VALUE bounds and a $schema key on every
// number, which only cost the agent tokens.
const tidySchema = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(tidySchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, entry]) =>
          key !== "$schema" &&
          !((key === "minimum" || key === "maximum") && Math.abs(Number(entry)) === Number.MAX_VALUE),
      )
      .map(([key, entry]) => [key, tidySchema(entry)]),
  );
};

/** The engine's design JSX guide for agents, under Wirely's own title. */
export const DESIGN_REFERENCE = JSX_REFERENCE.replace(/^# .*\n/, "# Wirely design JSX\n");

const PROJECT_ID = { type: "string", description: "A design project id from list_projects or create_project." };

// Arguments the engine's own server uses to write output to a local file.
// Wirely runs tools in memory and returns their output, so it never offers them.
const HIDDEN_ARGUMENTS: Partial<Record<string, string[]>> = { get_jsx: ["path"] };

/** The design tools as tools/list entries, each with `projectId` added. */
export const DESIGN_MCP_TOOLS: McpToolDefinition[] = DESIGN_TOOL_NAMES.flatMap((name) => {
  const tool = toolsByName.get(name);
  if (!tool) return [];
  const schema = tidySchema(toJsonSchema(tool.input, { errorMode: "ignore", typeMode: "input" })) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return [
    {
      name,
      description: `${tool.description} Works on a design project.`,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID,
          ...Object.fromEntries(
            Object.entries(schema.properties ?? {}).filter(([key]) => !HIDDEN_ARGUMENTS[name]?.includes(key)),
          ),
        },
        required: ["projectId", ...(schema.required ?? [])],
        additionalProperties: false,
      },
    },
  ];
});

export class DesignToolInputError extends Error {}

/**
 * Runs one design tool against a scene. Returns what the tool returned, which
 * is JSON for every tool here, and whether it can have changed the document.
 * Arguments are checked against the tool's own schema first, which also turns
 * numeric strings into numbers the way the engine's adapters do.
 */
export const runDesignTool = async (graph: SceneGraph, name: string, args: Record<string, unknown>) => {
  const tool = getDesignTool(name);
  if (!tool) throw new Error(`Unknown design tool "${name}".`);
  const parsed = v.safeParse(tool.input, args);
  if (!parsed.success) {
    throw new DesignToolInputError(
      parsed.issues.map((issue) => `${v.getDotPath(issue) ?? "arguments"}: ${issue.message}`).join("; "),
    );
  }
  const figma = new FigmaAPI(graph);
  const result = await tool.execute(figma, parsed.output);
  return { result, mutates: tool.mutates };
};
