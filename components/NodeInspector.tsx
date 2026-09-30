"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  BetweenHorizontalStart,
  Blend,
  Link2,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  SquareRoundCorner,
  Type,
  X,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/sonner";
import { previewNode } from "@/lib/nodePicker";
import {
  buildNodeLink,
  getNodeAttribute,
  getNodeStyle,
  getNodeText,
  findNodeSpan,
  NODE_STYLE_PROPERTIES,
  type NodeColorProperty,
  type NodeStyleProperty,
  setNodeColor,
  setNodeStyle,
  setNodeText,
  stampNodeIds,
} from "@/lib/pageNodes";
import { commitPageEdit } from "@/store/pageEdits";
import { type SelectedNode, useEditorStore } from "@/store/useEditorStore";

// Commits a color or style once the control has been still this long, so
// dragging through the palette or holding an arrow key saves once.
const COMMIT_DELAY_MS = 500;

const FONT_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

interface NodeInspectorProps {
  projectId: string;
  /** "panel" is the full Design tab. "chip" is the header alone, above the chat prompt. */
  variant: "panel" | "chip";
}

/**
 * The picked element. The Design tab shows its properties in sections laid
 * out like Figma's design panel, and the chat shows its header as a chip,
 * because the prompt then edits only this element. Text,
 * colors, and box styles change here directly, with no model call, and the
 * link lets an MCP agent find the same element.
 */
export default function NodeInspector({ projectId, variant }: NodeInspectorProps) {
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
  if (!selectedNode) {
    return variant === "panel" ? (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        Pick an element on a page with the element tool (E) to see and edit its properties.
      </p>
    ) : null;
  }
  const exists = findNodeSpan(source, selectedNode.nodeId) !== null;
  const text = exists ? getNodeText(source, selectedNode.nodeId) : null;
  // Reset only undoes a color set here, which is written as an arbitrary value class.
  const classes = ` ${getNodeAttribute(source, selectedNode.nodeId, "class") ?? ""}`;
  const overrides = { text: classes.includes(" text-[#"), bg: classes.includes(" bg-[#") };
  const inlineStyles = exists ? getNodeStyle(source, selectedNode.nodeId) : {};

  return (
    <NodeInspectorCard
      // A new element, or its text changed by anything else, resets the drafts.
      key={`${selectedNode.pageId}:${selectedNode.nodeId}:${text}`}
      node={selectedNode}
      pageTitle={pageTitle}
      exists={exists}
      text={text}
      overrides={overrides}
      inlineStyles={inlineStyles}
      showColors={!selectedNode.isSvg}
      projectId={projectId}
      variant={variant}
    />
  );
}

function NodeInspectorCard({
  node,
  pageTitle,
  exists,
  text,
  overrides,
  inlineStyles,
  showColors,
  projectId,
  variant,
}: {
  node: SelectedNode;
  pageTitle: string;
  exists: boolean;
  /** Null when the element holds other elements, so its text is not editable here. */
  text: string | null;
  /** Which colors carry a value set here, so reset has something to undo. */
  overrides: Record<NodeColorProperty, boolean>;
  /** Style values set here, which win over the page's classes. */
  inlineStyles: Partial<Record<NodeStyleProperty, string>>;
  /** False for SVG elements, which take fill and stroke instead of CSS colors and box styles. */
  showColors: boolean;
} & NodeInspectorProps) {
  const { pageId, nodeId } = node;
  const [draftText, setDraftText] = useState(text ?? "");
  const [colors, setColors] = useState<Record<NodeColorProperty, string | null>>({
    text: node.color,
    bg: node.background,
  });

  const commit = (edit: (html: string) => string | null) =>
    commitPageEdit(projectId, pageId, edit);

  // One pending edit per control. Moving to another control saves the first.
  const pendingRef = useRef<{ key: string; edit: (html: string) => string | null } | null>(null);
  const timerRef = useRef(0);
  const flushPending = () => {
    window.clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void commit(pending.edit);
  };
  const flushPendingRef = useRef(flushPending);
  useEffect(() => {
    flushPendingRef.current = flushPending;
  });
  // Leaving the element mid-drag still saves the value the user landed on.
  useEffect(() => () => flushPendingRef.current(), []);

  const scheduleCommit = (key: string, edit: (html: string) => string | null) => {
    if (pendingRef.current && pendingRef.current.key !== key) flushPending();
    pendingRef.current = { key, edit };
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flushPending, COMMIT_DELAY_MS);
  };

  const changeColor = (property: NodeColorProperty, color: string) => {
    setColors((current) => ({ ...current, [property]: color }));
    previewNode({ pageId, nodeId, ...(property === "text" ? { color } : { background: color }) });
    scheduleCommit(property, (html) => setNodeColor(html, nodeId, property, color));
  };

  /** An empty value removes the one set here, so the page's own style shows again. */
  const changeStyle = (property: NodeStyleProperty, value: string) => {
    previewNode({ pageId, nodeId, style: { [property]: value } });
    scheduleCommit(property, (html) => setNodeStyle(html, nodeId, property, value || null));
  };

  const resetColor = (property: NodeColorProperty) => {
    if (pendingRef.current?.key === property) pendingRef.current = null;
    flushPending();
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
    commit((html) => html);
    try {
      await navigator.clipboard.writeText(
        buildNodeLink({ origin: window.location.origin, projectId, pageId, nodeId }),
      );
      toast.success("Element link copied. Paste it to your agent with what to change.");
    } catch {
      toast.error("Could not copy the link. Check clipboard permissions.");
    }
  };

  const numberField = (property: NumberStyleProperty, prefix: ReactNode, label: string) => (
    <StyleField
      key={property}
      prefix={prefix}
      label={label}
      property={property}
      inline={inlineStyles[property]}
      computed={node.styles?.[property]}
      onChange={(value) => changeStyle(property, value)}
    />
  );

  const header = (
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
  );

  if (variant === "chip") {
    return <div className="mb-2 rounded-lg border border-border bg-card text-xs">{header}</div>;
  }

  return (
    <div className="text-xs">
      {header}

      {!exists ? (
        <p className="border-t border-border px-2.5 py-2 text-muted-foreground">
          This element is no longer on the page. Pick another one with the element tool (E).
        </p>
      ) : (
        <>
          {text !== null ? (
            <Section title="Content">
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
                className="block w-full resize-none rounded-md bg-muted/60 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Section>
          ) : null}
          {showColors ? (
            <>
              <Section title="Layout">
                <div className="grid grid-cols-2 gap-1.5">
                  {numberField("width", "W", "Width")}
                  {numberField("height", "H", "Height")}
                  {numberField("padding-inline", <MoveHorizontal className="h-3 w-3" />, "Horizontal padding")}
                  {numberField("padding-block", <MoveVertical className="h-3 w-3" />, "Vertical padding")}
                  {numberField("gap", <BetweenHorizontalStart className="h-3 w-3" />, "Gap between children")}
                </div>
              </Section>
              <Section title="Typography">
                <div className="grid grid-cols-2 gap-1.5">
                  {numberField("font-size", <Type className="h-3 w-3" />, "Font size")}
                  <WeightField
                    inline={inlineStyles["font-weight"]}
                    computed={node.styles?.["font-weight"]}
                    onChange={(value) => changeStyle("font-weight", value)}
                  />
                </div>
                <ColorRow
                  label="Color"
                  color={colors.text}
                  fallback="#000000"
                  isOverridden={overrides.text}
                  onChange={(color) => changeColor("text", color)}
                  onReset={() => resetColor("text")}
                />
              </Section>
              <Section title="Appearance">
                <div className="grid grid-cols-2 gap-1.5">
                  {numberField("opacity", <Blend className="h-3 w-3" />, "Opacity")}
                  {numberField("border-radius", <SquareRoundCorner className="h-3 w-3" />, "Corner radius")}
                </div>
              </Section>
              <Section title="Fill">
                <ColorRow
                  label="Fill"
                  color={colors.bg}
                  fallback="#ffffff"
                  isOverridden={overrides.bg}
                  onChange={(color) => changeColor("bg", color)}
                  onReset={() => resetColor("bg")}
                />
              </Section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5 border-t border-border px-2.5 pb-2.5 pt-2">
      <h3 className="font-medium text-foreground">{title}</h3>
      {children}
    </section>
  );
}

const FIELD_CLASS =
  "flex h-7 items-center gap-1.5 rounded-md bg-muted/60 px-2 focus-within:ring-1 focus-within:ring-ring";

/** A swatch, its hex value, and a reset when the color was set here. */
function ColorRow({
  label,
  color,
  fallback,
  isOverridden,
  onChange,
  onReset,
}: {
  label: string;
  color: string | null;
  fallback: string;
  isOverridden: boolean;
  onChange: (color: string) => void;
  onReset: () => void;
}) {
  return (
    <div className={FIELD_CLASS}>
      <label
        className="relative h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-border"
        style={{
          background:
            color ??
            "linear-gradient(to top right, transparent 45%, var(--destructive) 45% 55%, transparent 55%)",
        }}
      >
        <input
          type="color"
          value={color ?? fallback}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} color`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <span className="min-w-0 flex-1 truncate font-mono text-foreground">
        {color?.toUpperCase().slice(1) ?? "None"}
      </span>
      {isOverridden ? (
        <button
          type="button"
          onClick={onReset}
          title={`Remove the ${label.toLowerCase()} set here`}
          aria-label={`Reset ${label.toLowerCase()}`}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

type NumberStyleProperty = Exclude<NodeStyleProperty, "font-weight">;

/** Opacity reads and writes as a percent; everything else is px. */
const toDisplay = (property: NumberStyleProperty, value: number) =>
  String(Math.round((property === "opacity" ? value * 100 : value) * 100) / 100);

const toCss = (property: NumberStyleProperty, input: number) =>
  property === "opacity" ? String(Math.round(input) / 100) : `${input}px`;

const fieldTitle = (label: string, isInline: boolean) =>
  isInline
    ? `${label}, set here. Clear it to use the page's own value.`
    : `${label}, from the page. Change it to set it here.`;

/**
 * One number style. It shows the value set here, else the computed one, and
 * keeps its own draft only while focused, so an undo or an agent write shows up.
 */
function StyleField({
  prefix,
  label,
  property,
  inline,
  computed,
  onChange,
}: {
  prefix: ReactNode;
  label: string;
  property: NumberStyleProperty;
  inline: string | undefined;
  computed: number | undefined;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const isInline = inline !== undefined;
  const shown =
    draft ??
    (isInline
      ? toDisplay(property, Number.parseFloat(inline))
      : computed !== undefined
        ? toDisplay(property, computed)
        : "");

  return (
    <label title={fieldTitle(label, isInline)} className={FIELD_CLASS}>
      <span
        className={`flex w-3 shrink-0 justify-center ${isInline ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`}
      >
        {prefix}
      </span>
      <input
        type="number"
        min={0}
        max={property === "opacity" ? 100 : undefined}
        step={1}
        inputMode="decimal"
        value={shown}
        aria-label={label}
        onFocus={() => setDraft(shown)}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          setDraft(event.target.value);
          const value = event.target.value.trim();
          if (value === "") {
            onChange("");
            return;
          }
          const css = toCss(property, Number(value));
          if (NODE_STYLE_PROPERTIES[property].test(css)) onChange(css);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="min-w-0 flex-1 bg-transparent font-mono text-foreground [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {property === "opacity" ? <span className="text-muted-foreground">%</span> : null}
    </label>
  );
}

function WeightField({
  inline,
  computed,
  onChange,
}: {
  inline: string | undefined;
  computed: number | undefined;
  onChange: (value: string) => void;
}) {
  const shown = inline ?? (computed !== undefined ? String(computed) : "");
  return (
    <label title={fieldTitle("Font weight", inline !== undefined)} className={FIELD_CLASS}>
      <span
        className={`w-3 shrink-0 text-center font-semibold ${inline !== undefined ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`}
      >
        B
      </span>
      <select
        value={FONT_WEIGHTS.includes(shown) ? shown : ""}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Font weight"
        className="min-w-0 flex-1 bg-transparent font-mono text-foreground focus:outline-none"
      >
        <option value="">Page</option>
        {FONT_WEIGHTS.map((weight) => (
          <option key={weight} value={weight}>
            {weight}
          </option>
        ))}
      </select>
    </label>
  );
}
