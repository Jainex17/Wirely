/**
 * Screens are the top-level frames of a design document: one web or mobile
 * screen each, side by side on the canvas. These helpers are what the product
 * adds on top of the design tools: placing a new screen at its device size,
 * describing screens to an agent, rendering one to PNG, and handing one off
 * as code.
 */
import { sceneNodeToJSX } from "@open-pencil/core/io";
import { headlessRenderNodes } from "@open-pencil/core/io/formats/raster";
import { computeAllLayouts } from "@open-pencil/core/layout";
import type { SceneGraph } from "@open-pencil/scene-graph";
import {
  listScreens,
  nextScreenPosition,
  SCREEN_SIZES,
  type ScreenDevice,
  screensPage,
} from "@/lib/design/document";
import { assignNodeGuids } from "@/lib/design/ids";
import { runDesignTool } from "@/lib/design/tools";

/** The id a node keeps across saves, which is what agents and the editor see. See lib/design/ids.ts. */
export const publicIdOf = (node: { id: string; source: { id: string | null } }) => node.source.id ?? node.id;

/** Which device a screen was sized for, read from its width. */
export const screenDevice = (width: number): ScreenDevice | "custom" =>
  width === SCREEN_SIZES.mobile.width ? "mobile" : width === SCREEN_SIZES.desktop.width ? "desktop" : "custom";

export const describeScreens = (graph: SceneGraph) =>
  listScreens(graph).map((node) => ({
    id: publicIdOf(node),
    name: node.name,
    device: screenDevice(node.width),
    width: Math.round(node.width),
    height: Math.round(node.height),
  }));

/** The screen with this public id, or null. */
export const findScreen = (graph: SceneGraph, screenId: string) =>
  listScreens(graph).find((node) => publicIdOf(node) === screenId) ?? null;

/**
 * Renders `jsx` as a new screen to the right of the others, named `name`, at
 * the device's width and at least its height. The JSX root should be one
 * <Frame>; its children lay out inside the device size.
 */
export const addScreen = async (
  graph: SceneGraph,
  { name, device, jsx }: { name: string; device: ScreenDevice; jsx: string },
) => {
  const { x, y } = nextScreenPosition(graph);
  const { result } = await runDesignTool(graph, "render", { jsx, x, y });
  const id = (result as { id?: unknown } | null)?.id;
  const root = typeof id === "string" ? graph.getNode(id) : undefined;
  if (!root) {
    const error = (result as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : "The JSX did not render a node.");
  }
  // A screen is as wide as its device and at least as tall, growing with its
  // content. Fixed width and a minimum height on the root frame keep that
  // when layout runs again, where a plain resize would hug back to content.
  const size = SCREEN_SIZES[device];
  const sizing =
    root.layoutMode === "VERTICAL"
      ? { counterAxisSizing: "FIXED" as const, primaryAxisSizing: "HUG" as const }
      : root.layoutMode === "HORIZONTAL"
        ? { primaryAxisSizing: "FIXED" as const, counterAxisSizing: "HUG" as const }
        : {};
  graph.updateNode(root.id, {
    ...sizing,
    width: size.width,
    height: Math.max(size.height, Math.round(root.height)),
    minHeight: size.height,
  });
  computeAllLayouts(graph, screensPage(graph).id);
  graph.updateNode(root.id, { name });
  assignNodeGuids(graph);
  const screen = graph.getNode(root.id) ?? root;
  return { id: publicIdOf(screen), name, device, width: Math.round(screen.width), height: Math.round(screen.height) };
};

/** A screen, by public id, as PNG bytes at `scale`, or null when it renders nothing. */
export const renderScreenPng = (graph: SceneGraph, screenId: string, scale = 1) => {
  const screen = findScreen(graph, screenId);
  return screen
    ? headlessRenderNodes(graph, screensPage(graph).id, [screen.id], { format: "PNG", scale })
    : Promise.resolve(null);
};

/**
 * A screen, by public id, as React with Tailwind classes: the hand-off an
 * agent rebuilds in the user's own stack. Null when there is no such screen.
 */
export const screenToCode = (graph: SceneGraph, screenId: string) => {
  const screen = findScreen(graph, screenId);
  return screen ? sceneNodeToJSX(screen.id, graph, "tailwind") : null;
};
