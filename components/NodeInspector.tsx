"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, RotateCcw, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";
import { previewNode } from "@/lib/nodePicker";
import {
  buildNodeLink,
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

  return (
    <NodeInspectorCard
      // A new element, or its text changed by anything else, resets the drafts.
      key={`${selectedNode.pageId}:${selectedNode.nodeId}:${text}`}
      node={selectedNode}
      pageTitle={pageTitle}
      exists={exists}
      text={text}
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
  projectId,
  onSaveHtml,
}: {
  node: SelectedNode;
  pageTitle: string;
  exists: boolean;
  /** Null when the element holds other elements, so its text is not editable here. */
  text: string | null;
} & NodeInspectorProps) {
  const { pageId, nodeId } = node;
  const [draftText, setDraftText] = useState(text ?? "");
  const [colors, setColors] = useState({
    text: node.color ?? "#000000",
    bg: node.background ?? "#ffffff",
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
    <div className="mb-2 rounded-lg border border-sky-500/40 bg-card p-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="rounded bg-sky-500 px-1.5 py-0.5 font-mono text-[11px] text-white">
          {node.tag || "element"}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{pageTitle}</span>
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
        <p className="mt-2 text-muted-foreground">
          This element is no longer on the page. Pick another one with the element tool (E).
        </p>
      ) : (
        <>
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
              className="mt-2 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : null}
          <div className="mt-2 flex items-center gap-3">
            {(
              [
                ["text", "Text"],
                ["bg", "Fill"],
              ] as const
            ).map(([property, label]) => (
              <label key={property} className="flex items-center gap-1.5 text-muted-foreground">
                <input
                  type="color"
                  value={colors[property]}
                  onChange={(event) => changeColor(property, event.target.value)}
                  className="h-5 w-5 cursor-pointer rounded border border-border bg-transparent p-0"
                />
                {label}
                <button
                  type="button"
                  onClick={() => resetColor(property)}
                  title={`Remove the ${label.toLowerCase()} color set here`}
                  aria-label={`Reset ${label.toLowerCase()} color`}
                  className="rounded p-0.5 hover:bg-accent hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </label>
            ))}
          </div>
          <p className="mt-2 text-muted-foreground">The prompt below edits only this element.</p>
        </>
      )}
    </div>
  );
}
