"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, RotateCcw, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";
import { previewNode } from "@/lib/nodePicker";
import {
  buildNodeLink,
  getNodeAttribute,
  getNodeText,
  findNodeSpan,
  type NodeColorProperty,
  setNodeColor,
  setNodeText,
  stampNodeIds,
} from "@/lib/pageNodes";
import { type SelectedNode, useEditorStore } from "@/store/useEditorStore";

// Commits a color once the picker has been still this long, so dragging
// through the palette saves once instead of on every step.
const COLOR_COMMIT_DELAY_MS = 500;

// Shapes on a vector artboard take fill and stroke, so the CSS color classes
// the Text and Fill controls write would do nothing to them.
const SVG_SHAPE_TAGS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "g",
  "text",
]);

interface NodeInspectorProps {
  projectId: string;
  onSaveHtml: (pageId: string, html: string) => Promise<void>;
}

/**
 * The picked element, shown above the prompt. The prompt then edits only this
 * element. Text and colors change here directly, with no model call, and the
 * link lets an MCP agent find the same element.
 */
export default function NodeInspector({ projectId, onSaveHtml }: NodeInspectorProps) {
  const { selectedNode, pageTitle, pageHtml } = useEditorStore(
    useShallow((state) => {
      const page = state.pages.find((candidate) => candidate.id === state.selectedNode?.pageId);
      return {
        selectedNode: state.selectedNode,
        pageTitle: page?.title ?? "",
        pageHtml: page?.iframeHtml ?? "",
      };
    }),
  );
  // The canvas stamps ids before the editor has saved them, so lookups run on
  // the stamped HTML the frame is showing.
  const source = useMemo(() => stampNodeIds(pageHtml), [pageHtml]);
  if (!selectedNode) return null;
  const exists = findNodeSpan(source, selectedNode.nodeId) !== null;
  const text = exists ? getNodeText(source, selectedNode.nodeId) : null;
  // Reset only undoes a color set here, which is written as an arbitrary value class.
  const classes = ` ${getNodeAttribute(source, selectedNode.nodeId, "class") ?? ""}`;
  const overrides = { text: classes.includes(" text-[#"), bg: classes.includes(" bg-[#") };

  return (
    <NodeInspectorCard
      // A new element, or its text changed by anything else, resets the drafts.
      key={`${selectedNode.pageId}:${selectedNode.nodeId}:${text}`}
      node={selectedNode}
      pageTitle={pageTitle}
      exists={exists}
      text={text}
      overrides={overrides}
      showColors={!SVG_SHAPE_TAGS.has(selectedNode.tag)}
      projectId={projectId}
      onSaveHtml={onSaveHtml}
    />
  );
}

function NodeInspectorCard({
  node,
  pageTitle,
  exists,
  text,
  overrides,
  showColors,
  projectId,
  onSaveHtml,
}: {
  node: SelectedNode;
  pageTitle: string;
  exists: boolean;
  /** Null when the element holds other elements, so its text is not editable here. */
  text: string | null;
  /** Which colors carry a value set here, so reset has something to undo. */
  overrides: Record<NodeColorProperty, boolean>;
  showColors: boolean;
} & NodeInspectorProps) {
  const { pageId, nodeId } = node;
  const [draftText, setDraftText] = useState(text ?? "");
  const [colors, setColors] = useState<Record<NodeColorProperty, string | null>>({
    text: node.color,
    bg: node.background,
  });

  /** Applies an edit to the page's current HTML, then saves it. */
  const commit = async (edit: (html: string) => string | null) => {
    const current =
      useEditorStore.getState().pages.find((page) => page.id === pageId)?.iframeHtml ?? "";
    const next = edit(stampNodeIds(current));
    if (next === null) {
      toast.error("This element changed on the page. Pick it again.");
      return;
    }
    if (next === current) return;

    const { setPageHtml } = useEditorStore.getState();
    setPageHtml(pageId, next);
    try {
      await onSaveHtml(pageId, next);
    } catch (error) {
      logger.error("node_edit_save_failed", { pageId, error });
      setPageHtml(pageId, current);
      toast.error("Could not save the change. Try again.");
    }
  };

  const pendingColorRef = useRef<{ property: NodeColorProperty; color: string } | null>(null);
  const colorTimerRef = useRef(0);
  const flushColor = () => {
    window.clearTimeout(colorTimerRef.current);
    const pending = pendingColorRef.current;
    pendingColorRef.current = null;
    if (pending) {
      void commit((html) => setNodeColor(html, nodeId, pending.property, pending.color));
    }
  };
  const flushColorRef = useRef(flushColor);
  useEffect(() => {
    flushColorRef.current = flushColor;
  });
  // Leaving the element mid-drag still saves the color the user landed on.
  useEffect(() => () => flushColorRef.current(), []);

  const changeColor = (property: NodeColorProperty, color: string) => {
    setColors((current) => ({ ...current, [property]: color }));
    previewNode({ pageId, nodeId, ...(property === "text" ? { color } : { background: color }) });
    pendingColorRef.current = { property, color };
    window.clearTimeout(colorTimerRef.current);
    colorTimerRef.current = window.setTimeout(flushColor, COLOR_COMMIT_DELAY_MS);
  };

  const resetColor = (property: NodeColorProperty) => {
    pendingColorRef.current = null;
    window.clearTimeout(colorTimerRef.current);
    // Clears an unsaved preview too, which the saved HTML never had.
    previewNode({ pageId, nodeId, ...(property === "text" ? { color: "" } : { background: "" }) });
    setColors((current) => ({
      ...current,
      [property]: property === "text" ? node.color : node.background,
    }));
    void commit((html) => setNodeColor(html, nodeId, property, null));
  };

  const copyLink = async () => {
    // The link only resolves once the stamped ids are on the server.
    await commit((html) => html);
    try {
      await navigator.clipboard.writeText(
        buildNodeLink({ origin: window.location.origin, projectId, pageId, nodeId }),
      );
      toast.success("Element link copied. Paste it to your agent with what to change.");
    } catch {
      toast.error("Could not copy the link. Check clipboard permissions.");
    }
  };

  return (
    <div className="mb-2 rounded-lg border border-border bg-card text-xs">
      <div className="flex items-center gap-1.5 py-1.5 pl-2.5 pr-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
        <span className="shrink-0 font-mono text-foreground">&lt;{node.tag || "element"}&gt;</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">in {pageTitle}</span>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={!exists}
          title="Copy element link for your agent"
          aria-label="Copy element link"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => useEditorStore.getState().setSelectedNode(null)}
          title="Clear selection (Esc)"
          aria-label="Clear element selection"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!exists ? (
        <p className="border-t border-border px-2.5 py-2 text-muted-foreground">
          This element is no longer on the page. Pick another one with the element tool (E).
        </p>
      ) : text !== null || showColors ? (
        <div className="space-y-2 border-t border-border p-2">
          {text !== null ? (
            <textarea
              value={draftText}
              rows={2}
              aria-label="Element text"
              onChange={(event) => {
                setDraftText(event.target.value);
                previewNode({ pageId, nodeId, text: event.target.value });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                if (draftText !== text) {
                  void commit((html) => setNodeText(html, nodeId, draftText));
                }
              }}
              className="block w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : null}
          {showColors ? (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["text", "Text"],
                  ["bg", "Fill"],
                ] as const
              ).map(([property, label]) => (
                <div
                  key={property}
                  className="flex h-8 items-center gap-2 rounded-md border border-border bg-background pl-1.5 pr-1"
                >
                  <label
                    className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded border border-border"
                    style={{
                      background:
                        colors[property] ??
                        "linear-gradient(to top right, transparent 45%, var(--destructive) 45% 55%, transparent 55%)",
                    }}
                  >
                    <input
                      type="color"
                      value={colors[property] ?? (property === "text" ? "#000000" : "#ffffff")}
                      onChange={(event) => changeColor(property, event.target.value)}
                      aria-label={`${label} color`}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{label}</span>{" "}
                    <span className="font-mono text-foreground">
                      {colors[property]?.toUpperCase() ?? "None"}
                    </span>
                  </span>
                  {overrides[property] ? (
                    <button
                      type="button"
                      onClick={() => resetColor(property)}
                      title={`Remove the ${label.toLowerCase()} color set here`}
                      aria-label={`Reset ${label.toLowerCase()} color`}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
