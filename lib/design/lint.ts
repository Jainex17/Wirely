/**
 * Checks a design screen for problems an agent cannot see without rendering
 * it: low contrast, tiny text, text spilling out of its frame, invisible or
 * leftover default-sized nodes. add_screen and render return the report, so
 * an agent fixes the node by id instead of paying for a PNG to find it.
 */
import { createLinter } from "@open-pencil/core/lint";
import type { SceneGraph, SceneNode } from "@open-pencil/scene-graph";
import { createIdTranslator } from "@/lib/design/ids";

// The engine's own rules worth an agent's attention. Its naming and style
// rules flag every hand-written screen, so they stay off.
const linter = createLinter({
  config: { rules: { "color-contrast": "error", "min-text-size": "warning", "no-empty-frames": "warning" } },
});

const MAX_PROBLEMS = 10;
// A node the JSX did not size keeps the engine's default box.
const DEFAULT_SIZE = 100;
// Layout rounds to fractions of a pixel, so smaller overflows are not real.
const TOLERANCE_PX = 1;

const hasVisiblePaint = (node: SceneNode) =>
  node.fills.some((fill) => fill.visible) || node.strokes.some((stroke) => stroke.visible);

const descendants = (graph: SceneGraph, rootId: string): SceneNode[] =>
  graph.getChildren(rootId).flatMap((child) => (child.visible ? [child, ...descendants(graph, child.id)] : []));

/** Problems the engine's rules do not cover, as [node, message] pairs. */
const layoutProblems = (graph: SceneGraph, rootId: string) =>
  descendants(graph, rootId).flatMap((node): Array<[SceneNode, string]> => {
    const hasContent =
      node.childIds.length > 0 || hasVisiblePaint(node) || (node.type === "TEXT" && node.text.trim() !== "");
    if (hasContent && (node.width < TOLERANCE_PX || node.height < TOLERANCE_PX)) {
      return [[node, `has content but is ${Math.round(node.width)}×${Math.round(node.height)}, so it does not show`]];
    }
    if (node.childIds.length === 0 && node.type !== "TEXT" && node.width === DEFAULT_SIZE && node.height === DEFAULT_SIZE) {
      return [[node, "is 100×100, the default size. If you did not size it, set w and h"]];
    }
    const parent = node.parentId ? graph.getNode(node.parentId) : undefined;
    if (
      node.type === "TEXT" &&
      parent &&
      // Absolute text may hang outside its frame on purpose, like a badge,
      // unless the frame clips it.
      (node.layoutPositioning !== "ABSOLUTE" || parent.clipsContent) &&
      (node.x < -TOLERANCE_PX ||
        node.y < -TOLERANCE_PX ||
        node.x + node.width > parent.width + TOLERANCE_PX ||
        node.y + node.height > parent.height + TOLERANCE_PX)
    ) {
      return [[node, `overflows its parent "${parent.name}"${parent.clipsContent ? " and is clipped" : ""}`]];
    }
    return [];
  });

/** The screen's problems, one line each with the node id the design tools take. Empty when it is clean. */
export const lintScreen = (graph: SceneGraph, screenId: string) => {
  const ids = createIdTranslator(graph);
  const label = (node: { type?: string; name: string; id: string }) =>
    `${node.type ?? "Node"} "${node.name}" (id: ${ids.publicId(node.id)})`;
  const engine = linter.lintGraph(graph, [screenId]).messages.map((message) => {
    const node = graph.getNode(message.nodeId);
    return `${message.severity}: ${label(node ?? { name: message.nodeName, id: message.nodeId })}: ${message.message}`;
  });
  const own = layoutProblems(graph, screenId).map(([node, message]) => `warning: ${label(node)} ${message}`);
  return [...engine, ...own];
};

/** A short report for a tool result, or null when the screen is clean. */
export const describeScreenProblems = (graph: SceneGraph, screenId: string) => {
  const problems = lintScreen(graph, screenId);
  if (problems.length === 0) return null;
  const shown = problems.slice(0, MAX_PROBLEMS);
  const more = problems.length - shown.length;
  return [
    `Lint found ${problems.length} problem${problems.length === 1 ? "" : "s"}:`,
    ...shown.map((line) => `- ${line}`),
    ...(more > 0 ? [`- and ${more} more.`] : []),
  ].join("\n");
};
