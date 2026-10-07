/**
 * A project's design document, the scene of frames the Design tab draws and design
 * tools edit, kept as .fig bytes. The same functions run in the browser and on
 * the server, since the design engine has no DOM dependency: the editor loads
 * a document with them, and an MCP tool call loads, edits, and saves one.
 */
import { BUILTIN_IO_FORMATS, IORegistry } from "@open-pencil/core/io";
import { SceneGraph, type SceneNode } from "@open-pencil/scene-graph";
import { z } from "zod";
import { assignNodeGuids } from "@/lib/design/ids";

const io = new IORegistry(BUILTIN_IO_FORMATS);

// The .fig writer drops grid layout: a grid frame reads back with no layout
// and no padding, and its cells collapse. Each grid frame and grid cell keeps
// those fields in its plugin data, which .fig does save, and gets them back on
// read.
const GRID_PLUGIN_ID = "wirely";
const GRID_KEY = "grid";
const gridFields = (node: SceneNode) =>
  node.layoutMode === "GRID"
    ? {
        layoutMode: node.layoutMode,
        gridTemplateColumns: node.gridTemplateColumns,
        gridTemplateRows: node.gridTemplateRows,
        gridColumnGap: node.gridColumnGap,
        gridRowGap: node.gridRowGap,
        paddingTop: node.paddingTop,
        paddingRight: node.paddingRight,
        paddingBottom: node.paddingBottom,
        paddingLeft: node.paddingLeft,
      }
    : {};

const stashGridLayout = (graph: SceneGraph) => {
  for (const node of graph.nodes.values()) {
    const fields = { ...gridFields(node), ...(node.gridPosition ? { gridPosition: node.gridPosition } : {}) };
    const others = node.pluginData.filter((entry) => !(entry.pluginId === GRID_PLUGIN_ID && entry.key === GRID_KEY));
    node.pluginData =
      Object.keys(fields).length > 0
        ? [...others, { pluginId: GRID_PLUGIN_ID, key: GRID_KEY, value: JSON.stringify(fields) }]
        : others;
  }
};

// The editor uploads document bytes, so stored plugin data is untrusted: only
// these fields, well formed, are restored, and anything else is ignored.
const track = z.object({ sizing: z.enum(["FIXED", "FR", "AUTO"]), value: z.number() });
const storedGridFields = z.object({
  layoutMode: z.literal("GRID").optional(),
  gridTemplateColumns: z.array(track).optional(),
  gridTemplateRows: z.array(track).optional(),
  gridColumnGap: z.number().optional(),
  gridRowGap: z.number().optional(),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  gridPosition: z
    .object({ column: z.number(), row: z.number(), columnSpan: z.number(), rowSpan: z.number() })
    .optional(),
});

const parseStoredGridFields = (value: string) => {
  try {
    const parsed = storedGridFields.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const restoreGridLayout = (graph: SceneGraph) => {
  for (const node of graph.nodes.values()) {
    const entry = node.pluginData.find((item) => item.pluginId === GRID_PLUGIN_ID && item.key === GRID_KEY);
    const fields = entry ? parseStoredGridFields(entry.value) : null;
    if (fields) Object.assign(node, fields);
  }
};

/** The one page a new document has. Screens are its top-level frames. */
export const SCREENS_PAGE_NAME = "Screens";

/** Frame sizes for a new screen, matching the canvas presets of HTML pages. */
export const SCREEN_SIZES = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type ScreenDevice = keyof typeof SCREEN_SIZES;

export const isScreenDevice = (value: unknown): value is ScreenDevice =>
  typeof value === "string" && value in SCREEN_SIZES;

// Space between screens placed side by side, in canvas px.
const SCREEN_GAP = 120;

/**
 * Parses .fig bytes into a scene. Sizes and positions are the ones saved, which
 * were laid out with real font metrics, so nothing is laid out here: in the
 * browser the font measurer only exists once the canvas mounts, and laying out
 * before that would size text from estimates.
 */
export const readDesignDocument = async (bytes: Uint8Array) => {
  const { graph } = await io.readDocument({ name: "document.fig", data: bytes });
  // Layout treats a node read from .fig as drawn by Figma: it keeps the size
  // and position stored with it instead of laying it out. Wirely writes its
  // own documents, so after an edit that kept size goes stale, packing a filled
  // row to one side or clipping the bottom of a screen. Clearing the format and
  // the stored layout lets the next edit lay every frame out. The node's GUID
  // in source.id stays.
  for (const node of graph.nodes.values()) {
    node.source.format = null;
    node.derivedLayout = null;
  }
  restoreGridLayout(graph);
  return graph;
};

/** The scene as .fig bytes. New nodes get their GUIDs first, so their ids last. */
export const writeDesignDocument = async (graph: SceneGraph) => {
  assignNodeGuids(graph);
  stashGridLayout(graph);
  const { data } = await io.writeDocument("fig", graph);
  if (!(data instanceof Uint8Array)) throw new Error("The design engine did not write binary .fig data.");
  return data;
};

/** An empty document: one page for screens and nothing on it. */
export const createDesignDocument = async () => {
  const graph = new SceneGraph();
  const [page] = graph.getPages();
  graph.updateNode(page.id, { name: SCREENS_PAGE_NAME });
  return writeDesignDocument(graph);
};

/** The page screens live on: the first page, which every document has. */
export const screensPage = (graph: SceneGraph) => {
  const [page] = graph.getPages();
  if (!page) throw new Error("The design document has no page.");
  return page;
};

/** The top-level frames of the screens page, which the product calls screens. */
export const listScreens = (graph: SceneGraph) =>
  graph
    .getChildren(screensPage(graph).id)
    .filter((node) => node.type === "FRAME" || node.type === "COMPONENT" || node.type === "SECTION");

/** Where a new screen goes: right of every screen on the page, top aligned. */
export const nextScreenPosition = (graph: SceneGraph) => {
  const screens = listScreens(graph);
  if (screens.length === 0) return { x: 0, y: 0 };
  const right = Math.max(...screens.map((node) => node.x + node.width));
  const top = Math.min(...screens.map((node) => node.y));
  return { x: right + SCREEN_GAP, y: top };
};
