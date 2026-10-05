/**
 * MCP handlers for design projects, whose screens are nodes in one document
 * rather than HTML pages. The design engine's own tools edit that document
 * (see lib/design/tools.ts), add_screen places a new web or mobile screen, and
 * a few page tools agents already know (list_pages, get_page, get_page_png,
 * delete_page) answer for screens instead of pages.
 *
 * Every write goes through editProjectDocument, which saves only if nobody
 * saved in between and otherwise runs the call again on the newer document.
 */
import { selectionToJSX } from "@open-pencil/core/io";
import type { SceneGraph } from "@open-pencil/scene-graph";
import { z } from "zod";
import { isScreenDevice, SCREEN_SIZES, screensPage } from "@/lib/design/document";
import { assignNodeGuids, createIdTranslator } from "@/lib/design/ids";
import { describeScreenProblems } from "@/lib/design/lint";
import { editProjectDocument, readProjectDocument } from "@/lib/design/projectDocument";
import {
  addScreen,
  describeScreens,
  findScreen,
  renderScreenPng,
  screenToCode,
} from "@/lib/design/screens";
import { DESIGN_MCP_TOOLS, DESIGN_REFERENCE, DesignToolInputError, isDesignToolName, runDesignTool } from "@/lib/design/tools";
import type { McpToolDefinition, ToolCallResult } from "@/lib/mcp/protocol";
import { fail, succeed, text } from "@/lib/mcp/results";

type ToolArgs = Record<string, unknown>;

const NAME_MAX_CHARS = 120;
const JSX_MAX_CHARS = 200_000;
// get_page_png caps a screen's long side, like the HTML screenshot does.
const PNG_MAX_SIDE_PX = 2_400;

const MISSING = "Design project not found. Use list_projects for valid ids.";
const BUSY = "The document kept changing while saving. Try the call again.";

const formatIssues = (issues: z.ZodError["issues"]) =>
  issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`).join("; ");

const projectArgs = z.object({ projectId: z.string().trim().min(1) }).loose();

/** The local id of the screen holding `nodeId`, or null when it sits outside every screen. */
const screenContaining = (graph: SceneGraph, nodeId: string) => {
  const pageId = screensPage(graph).id;
  for (let node = graph.getNode(nodeId); node; node = node.parentId ? graph.getNode(node.parentId) : undefined) {
    if (node.parentId === pageId) return node.id;
  }
  return null;
};

/** Runs one of the engine's design tools on the project's document. */
const runEngineTool = async (userId: string, name: string, args: ToolArgs): Promise<ToolCallResult> => {
  const parsed = projectArgs.safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const { projectId, ...toolArgs } = parsed.data;

  try {
    const edit = await editProjectDocument(projectId, userId, async (graph) => {
      const before = createIdTranslator(graph);
      const input = before.argsToLocal(toolArgs);
      const { result, mutates } = await runDesignTool(graph, name, input);
      assignNodeGuids(graph);
      // A deleted node is gone from the new translator, so its id comes from the old one.
      const value = before.resultToPublic(createIdTranslator(graph).resultToPublic(result));
      const id = (result as { id?: unknown } | null)?.id;
      const screen = name === "render" && typeof id === "string" ? screenContaining(graph, id) : null;
      return { value: { value, problems: screen ? describeScreenProblems(graph, screen) : null }, changed: mutates };
    });
    if (edit.status === "missing") return fail(MISSING);
    if (edit.status === "busy") return fail(BUSY);
    const { value, problems } = edit.value;
    const error = (value as { error?: unknown } | null)?.error;
    if (typeof error === "string") return fail(error);
    return succeed(JSON.stringify(value ?? null) + (problems ? `\n${problems}` : ""));
  } catch (error) {
    if (error instanceof DesignToolInputError) return fail(`Invalid arguments. ${error.message}`);
    throw error;
  }
};

const addScreenHandler = async (userId: string, args: ToolArgs): Promise<ToolCallResult> => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      name: z.string().trim().min(1).max(NAME_MAX_CHARS),
      device: z.string().refine(isScreenDevice, { message: "Use desktop or mobile." }),
      jsx: z.string().min(1).max(JSX_MAX_CHARS),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const { projectId, name, jsx } = parsed.data;
  const device = isScreenDevice(parsed.data.device) ? parsed.data.device : "desktop";

  type Added = (Awaited<ReturnType<typeof addScreen>> & { problems: string | null }) | string;
  const edit = await editProjectDocument<Added>(projectId, userId, async (graph) => {
    try {
      const added = await addScreen(graph, { name, device, jsx });
      const screen = findScreen(graph, added.id);
      return { value: { ...added, problems: screen ? describeScreenProblems(graph, screen.id) : null }, changed: true };
    } catch (error) {
      // The engine's reason the JSX did not render, for the agent to fix.
      return { value: error instanceof Error ? error.message : String(error), changed: false };
    }
  });
  if (edit.status === "missing") return fail(MISSING);
  if (edit.status === "busy") return fail(BUSY);
  const screen = edit.value;
  if (typeof screen === "string") return fail(`The JSX did not render: ${screen}`);
  return succeed(
    `Added ${screen.device} screen "${screen.name}" (id: ${screen.id}, ${screen.width}×${screen.height}). ` +
      "Edit it with the design tools, passing node ids from get_page_tree or get_jsx." +
      (screen.problems ? `\n${screen.problems}` : "\nLint found no problems."),
  );
};

const listScreensHandler = async (userId: string, args: ToolArgs): Promise<ToolCallResult> => {
  const parsed = projectArgs.safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const document = await readProjectDocument(parsed.data.projectId, userId);
  if (!document) return fail(MISSING);
  const screens = describeScreens(document.graph);
  return succeed(
    screens.length > 0
      ? JSON.stringify(screens)
      : "This design project has no screens yet. Add one with add_screen.",
  );
};

const screenArgs = z.object({ projectId: z.string().trim().min(1), pageId: z.string().trim().min(1) }).loose();

const getScreenCode = async (userId: string, args: ToolArgs): Promise<ToolCallResult> => {
  const parsed = screenArgs.safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const document = await readProjectDocument(parsed.data.projectId, userId);
  if (!document) return fail(MISSING);
  const code = screenToCode(document.graph, parsed.data.pageId);
  if (code === null) return fail("Screen not found. Use list_pages for screen ids.");
  return {
    content: [
      text(
        `Screen ${parsed.data.pageId} as React with Tailwind classes. Treat it as the visual spec and ` +
          "rebuild it with the project's own components and styles.",
      ),
      text(code),
    ],
  };
};

const getScreenPng = async (userId: string, args: ToolArgs): Promise<ToolCallResult> => {
  const parsed = screenArgs.safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const document = await readProjectDocument(parsed.data.projectId, userId);
  if (!document) return fail(MISSING);
  const screen = findScreen(document.graph, parsed.data.pageId);
  if (!screen) return fail("Screen not found. Use list_pages for screen ids.");
  const scale = Math.min(1, PNG_MAX_SIDE_PX / Math.max(screen.width, screen.height, 1));
  const png = await renderScreenPng(document.graph, parsed.data.pageId, scale);
  if (!png) return fail("The screen rendered nothing. Check it has visible content.");
  const image = { type: "image" as const, data: Buffer.from(png).toString("base64"), mimeType: "image/png" };
  return args.lint === true
    ? { content: [text(describeScreenProblems(document.graph, screen.id) ?? "Lint found no problems."), image] }
    : { content: [image] };
};

const deleteScreen = async (userId: string, args: ToolArgs): Promise<ToolCallResult> => {
  const parsed = screenArgs.safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const edit = await editProjectDocument(parsed.data.projectId, userId, async (graph) => {
    const screen = findScreen(graph, parsed.data.pageId);
    if (!screen) return { value: null, changed: false };
    graph.deleteNode(screen.id);
    return { value: screen.name, changed: true };
  });
  if (edit.status === "missing") return fail(MISSING);
  if (edit.status === "busy") return fail(BUSY);
  return edit.value === null
    ? fail("Screen not found. Use list_pages for screen ids.")
    : succeed(`Deleted screen "${edit.value}".`);
};

/** Page tools that answer for screens in a design project. */
const SCREEN_HANDLERS: Record<string, (userId: string, args: ToolArgs) => Promise<ToolCallResult>> = {
  add_screen: addScreenHandler,
  list_pages: listScreensHandler,
  get_page: getScreenCode,
  get_page_png: getScreenPng,
  delete_page: deleteScreen,
};

/**
 * The handler for `name` in a design project, or null when the tool only
 * works on HTML pages.
 */
export const designHandlerFor = (name: string) => {
  if (isDesignToolName(name)) return (userId: string, args: ToolArgs) => runEngineTool(userId, name, args);
  return SCREEN_HANDLERS[name] ?? null;
};

/** Whether `name` only makes sense in a design project. */
export const isDesignOnlyTool = (name: string) => isDesignToolName(name) || name === "add_screen";

export const ADD_SCREEN_TOOL: McpToolDefinition = {
  name: "add_screen",
  description:
    "Add a screen to a design project, to the right of the others. Write it as design JSX: one root " +
    "<Frame> with auto layout (flex=\"col\"), padding, and gap, holding <Frame>, <Text>, <Rectangle>, " +
    "<Ellipse>, <Image>, <svg>, and <Icon> nodes. The root is sized to the device: " +
    `desktop ${SCREEN_SIZES.desktop.width}×${SCREEN_SIZES.desktop.height}, ` +
    `mobile ${SCREEN_SIZES.mobile.width}×${SCREEN_SIZES.mobile.height}, growing taller with its ` +
    "content. Text weight takes a number like 600, or normal, medium, or bold; other names fall back to " +
    "400. Returns the screen id and lint problems (contrast, tiny text, overflow, hidden or default-sized " +
    "nodes) by node id; get_page_tree lists its node ids for the design tools.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "A design project id from list_projects or create_project." },
      name: { type: "string", description: "Screen name shown on the canvas, like \"Dashboard / Option B · Card grid\"." },
      device: { type: "string", enum: ["desktop", "mobile"], description: "The screen's device size." },
      jsx: { type: "string", description: "The screen as design JSX with one root <Frame>." },
    },
    required: ["projectId", "name", "device", "jsx"],
    additionalProperties: false,
  },
};

/** The engine's design JSX guide, which an agent reads once before building screens. */
export const getDesignReference = async (): Promise<ToolCallResult> => succeed(DESIGN_REFERENCE);

export const DESIGN_REFERENCE_TOOL: McpToolDefinition = {
  name: "get_design_reference",
  description:
    "The design JSX guide: elements, layout, sizing, paint, text, and components for add_screen and " +
    "render. Read it once before building your first screen.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

/** What tools/list adds for design projects, after the shared and HTML page tools. */
export const DESIGN_CATALOG: McpToolDefinition[] = [DESIGN_REFERENCE_TOOL, ADD_SCREEN_TOOL, ...DESIGN_MCP_TOOLS];

/**
 * get_selection for a design project: the layers the user has selected in the
 * editor, by the ids the design tools take, with the screen each sits in and
 * the selection as design JSX.
 */
export const describeDesignSelection = async (
  userId: string,
  selection: { projectId: string; projectTitle: string; nodeId: string; selectedAt: Date | null },
): Promise<ToolCallResult> => {
  const document = await readProjectDocument(selection.projectId, userId);
  if (!document) return fail(MISSING);
  const { graph } = document;
  const ids = createIdTranslator(graph);
  const screenIds = new Set(describeScreens(graph).map((screen) => screen.id));
  const nodes = selection.nodeId
    .split(",")
    .flatMap((publicId) => {
      const node = graph.getNode(ids.localId(publicId));
      return node ? [{ publicId, node }] : [];
    });
  if (nodes.length === 0) {
    return fail("The selected layers were deleted. Ask the user to select again.");
  }

  const screenNameOf = (localId: string) => {
    for (let node = graph.getNode(localId); node; node = node.parentId ? graph.getNode(node.parentId) : undefined) {
      if (screenIds.has(ids.publicId(node.id))) return node.name;
    }
    return null;
  };
  const minutesAgo = selection.selectedAt ? Math.round((Date.now() - selection.selectedAt.getTime()) / 60_000) : null;
  const when = minutesAgo === null ? "" : minutesAgo < 1 ? " just now" : ` ${minutesAgo} min ago`;
  const list = nodes
    .map(({ publicId, node }) => {
      const screen = screenNameOf(node.id);
      return `- ${node.type} "${node.name}" (id: ${publicId})${screen && screen !== node.name ? ` in screen "${screen}"` : ""}`;
    })
    .join("\n");
  return {
    content: [
      text(
        `Selected${when} in "${selection.projectTitle}" (projectId: ${selection.projectId}):\n${list}\n` +
          "Edit them with the design tools using these ids. Their design JSX:",
      ),
      text(selectionToJSX(nodes.map(({ node }) => node.id), graph, "openpencil")),
    ],
  };
};
