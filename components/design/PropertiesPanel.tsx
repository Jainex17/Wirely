"use client";

import type { Editor } from "@open-pencil/core/editor";
import type { Color, Effect, Fill, LayoutSizing, SceneNode, Stroke } from "@open-pencil/scene-graph";
import { sceneNodeToJSX } from "@open-pencil/core/io";
import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartHorizontal,
  ArrowDown,
  ArrowRight,
  Code,
  Minus,
  Plus,
  StretchHorizontal,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useEditorValue } from "@/components/design/useEditorValue";
import { cn } from "@/lib/utils";

// ---- color helpers -------------------------------------------------------

const toHex = ({ r, g, b }: Color) =>
  `#${[r, g, b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const fromHex = (hex: string): Color | null => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  const channel = (index: number) => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16) / 255;
  return { r: channel(0), g: channel(1), b: channel(2), a: 1 };
};

const solidFill = (color: Color): Fill => ({ type: "SOLID", color, opacity: 1, visible: true });

// ---- panel ---------------------------------------------------------------

/**
 * The right panel: the selected layer's properties, edited the way Figma's
 * design panel does. Every change goes through the editor with undo, so it
 * shows on the canvas at once and Cmd+Z takes it back.
 */
export default function PropertiesPanel({ editor }: { editor: Editor }) {
  // Re-read on every scene change; the node object stays the same, so the
  // version is what tells React it changed.
  const selection = useEditorValue(
    editor,
    (current) => ({ nodes: current.getSelectedNodes(), version: current.state.sceneVersion }),
    (a, b) => a.version === b.version && a.nodes.length === b.nodes.length && a.nodes.every((node, index) => node === b.nodes[index]),
  );
  const node = selection.nodes.length === 1 ? selection.nodes[0] : null;

  if (selection.nodes.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">Select a layer to edit it. Click a screen&apos;s name to select the screen.</p>;
  }
  if (!node) return <p className="px-3 py-3 text-xs text-muted-foreground">{selection.nodes.length} layers selected.</p>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-xs">
      <NodeProperties key={node.id} editor={editor} node={node} />
    </div>
  );
}

function NodeProperties({ editor, node }: { editor: Editor; node: SceneNode }) {
  const update = (changes: Partial<SceneNode>, label: string) => editor.updateNodeWithUndo(node.id, changes, label);
  const isContainer = node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE" || node.type === "SECTION";

  return (
    <div className="divide-y divide-border">
      <Section title={node.type === "TEXT" ? "Text layer" : node.type.charAt(0) + node.type.slice(1).toLowerCase()}>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberInput label="X" value={node.x} onCommit={(x) => update({ x }, "Move")} />
          <NumberInput label="Y" value={node.y} onCommit={(y) => update({ y }, "Move")} />
          <NumberInput label="W" value={node.width} min={1} onCommit={(width) => update({ width, ...fixedSizing(node, "width") }, "Resize")} />
          <NumberInput label="H" value={node.height} min={1} onCommit={(height) => update({ height, ...fixedSizing(node, "height") }, "Resize")} />
          <NumberInput label="°" value={node.rotation} onCommit={(rotation) => update({ rotation }, "Rotate")} />
          <NumberInput label="R" value={node.cornerRadius} min={0} onCommit={(cornerRadius) => update(radius(cornerRadius), "Corner radius")} />
        </div>
      </Section>

      {isContainer ? <AutoLayoutSection editor={editor} node={node} update={update} /> : null}
      {node.parentId && editor.getNode(node.parentId)?.layoutMode !== "NONE" && editor.getNode(node.parentId)?.layoutMode ? (
        <ChildSizingSection node={node} update={update} />
      ) : null}
      {node.type === "TEXT" ? <TypographySection node={node} update={update} /> : null}

      <Section title="Layer">
        <NumberInput label="Opacity %" value={Math.round(node.opacity * 100)} min={0} max={100} onCommit={(value) => update({ opacity: value / 100 }, "Opacity")} />
      </Section>

      <FillSection node={node} update={update} />
      <StrokeSection node={node} update={update} />
      <ShadowSection node={node} update={update} />
      <ExportSection editor={editor} node={node} />
    </div>
  );
}

/** Typing a width or height makes that axis fixed, the way Figma does. */
const fixedSizing = (node: SceneNode, axis: "width" | "height"): Partial<SceneNode> => {
  if (node.layoutMode === "NONE") return {};
  const isPrimary = (node.layoutMode === "HORIZONTAL") === (axis === "width");
  return isPrimary ? { primaryAxisSizing: "FIXED" } : { counterAxisSizing: "FIXED" };
};

const radius = (value: number): Partial<SceneNode> => ({
  cornerRadius: value,
  topLeftRadius: value,
  topRightRadius: value,
  bottomRightRadius: value,
  bottomLeftRadius: value,
  independentCorners: false,
});

type Update = (changes: Partial<SceneNode>, label: string) => void;

function AutoLayoutSection({ editor, node, update }: { editor: Editor; node: SceneNode; update: Update }) {
  const hasLayout = node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL";
  return (
    <Section
      title="Auto layout"
      action={
        <IconToggle
          label={hasLayout ? "Remove auto layout" : "Add auto layout (Shift+A)"}
          onClick={() => editor.setLayoutMode(node.id, hasLayout ? "NONE" : "VERTICAL")}
        >
          {hasLayout ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </IconToggle>
      }
    >
      {hasLayout ? (
        <div className="space-y-1.5">
          <div className="flex gap-1">
            <Segment
              value={node.layoutMode}
              options={[
                { value: "VERTICAL", label: "Vertical", icon: <ArrowDown className="h-3.5 w-3.5" /> },
                { value: "HORIZONTAL", label: "Horizontal", icon: <ArrowRight className="h-3.5 w-3.5" /> },
              ]}
              onChange={(mode) => editor.setLayoutMode(node.id, mode)}
            />
            <Segment
              value={node.counterAxisAlign}
              options={[
                { value: "MIN", label: "Align start", icon: <AlignStartHorizontal className="h-3.5 w-3.5" /> },
                { value: "CENTER", label: "Align center", icon: <AlignCenterHorizontal className="h-3.5 w-3.5" /> },
                { value: "MAX", label: "Align end", icon: <AlignEndHorizontal className="h-3.5 w-3.5" /> },
                { value: "STRETCH", label: "Stretch", icon: <StretchHorizontal className="h-3.5 w-3.5" /> },
              ]}
              onChange={(counterAxisAlign) => update({ counterAxisAlign }, "Align")}
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberInput label="Gap" value={node.itemSpacing} min={0} onCommit={(itemSpacing) => update({ itemSpacing }, "Gap")} />
            <SelectInput
              label="Distribute"
              value={node.primaryAxisAlign}
              options={[
                ["MIN", "Start"],
                ["CENTER", "Center"],
                ["MAX", "End"],
                ["SPACE_BETWEEN", "Space between"],
              ]}
              onChange={(primaryAxisAlign) => update({ primaryAxisAlign: primaryAxisAlign as SceneNode["primaryAxisAlign"] }, "Distribute")}
            />
            <NumberInput
              label="Pad X"
              value={node.paddingLeft}
              min={0}
              onCommit={(value) => update({ paddingLeft: value, paddingRight: value }, "Padding")}
            />
            <NumberInput
              label="Pad Y"
              value={node.paddingTop}
              min={0}
              onCommit={(value) => update({ paddingTop: value, paddingBottom: value }, "Padding")}
            />
            <SizingInput label="W" value={node.layoutMode === "HORIZONTAL" ? node.primaryAxisSizing : node.counterAxisSizing} onChange={(sizing) => update(node.layoutMode === "HORIZONTAL" ? { primaryAxisSizing: sizing } : { counterAxisSizing: sizing }, "Width sizing")} />
            <SizingInput label="H" value={node.layoutMode === "VERTICAL" ? node.primaryAxisSizing : node.counterAxisSizing} onChange={(sizing) => update(node.layoutMode === "VERTICAL" ? { primaryAxisSizing: sizing } : { counterAxisSizing: sizing }, "Height sizing")} />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">Lay out children in a row or column with gap and padding.</p>
      )}
    </Section>
  );
}

/** A child of an auto layout frame: fill the parent or keep its own size. */
function ChildSizingSection({ node, update }: { node: SceneNode; update: Update }) {
  return (
    <Section title="In auto layout">
      <div className="grid grid-cols-2 gap-1.5">
        <SelectInput
          label="Grow"
          value={node.layoutGrow > 0 ? "fill" : "fixed"}
          options={[
            ["fixed", "Fixed"],
            ["fill", "Fill"],
          ]}
          onChange={(value) => update({ layoutGrow: value === "fill" ? 1 : 0 }, "Fill container")}
        />
        <SelectInput
          label="Stretch"
          value={node.layoutAlignSelf === "STRETCH" ? "stretch" : "auto"}
          options={[
            ["auto", "Auto"],
            ["stretch", "Stretch"],
          ]}
          onChange={(value) => update({ layoutAlignSelf: value === "stretch" ? "STRETCH" : "AUTO" }, "Stretch")}
        />
      </div>
    </Section>
  );
}

function TypographySection({ node, update }: { node: SceneNode; update: Update }) {
  return (
    <Section title="Text">
      <div className="space-y-1.5">
        <TextInput label="Font" value={node.fontFamily} onCommit={(fontFamily) => update({ fontFamily }, "Font")} />
        <div className="grid grid-cols-2 gap-1.5">
          <NumberInput label="Size" value={node.fontSize} min={1} onCommit={(fontSize) => update({ fontSize }, "Font size")} />
          <SelectInput
            label="Weight"
            value={String(node.fontWeight)}
            options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => [String(weight), String(weight)])}
            onChange={(value) => update({ fontWeight: Number(value) }, "Font weight")}
          />
          <NumberInput
            label="Line"
            value={node.lineHeight ?? 0}
            min={0}
            onCommit={(lineHeight) => update({ lineHeight: lineHeight > 0 ? lineHeight : null }, "Line height")}
          />
          <NumberInput label="Letter" value={node.letterSpacing} onCommit={(letterSpacing) => update({ letterSpacing }, "Letter spacing")} />
        </div>
        <SelectInput
          label="Align"
          value={node.textAlignHorizontal}
          options={[
            ["LEFT", "Left"],
            ["CENTER", "Center"],
            ["RIGHT", "Right"],
            ["JUSTIFIED", "Justified"],
          ]}
          onChange={(value) => update({ textAlignHorizontal: value as SceneNode["textAlignHorizontal"] }, "Text align")}
        />
      </div>
    </Section>
  );
}

function FillSection({ node, update }: { node: SceneNode; update: Update }) {
  const fills = node.fills;
  return (
    <Section
      title="Fill"
      action={
        <IconToggle label="Add fill" onClick={() => update({ fills: [...fills, solidFill({ r: 0.85, g: 0.85, b: 0.85, a: 1 })] }, "Add fill")}>
          <Plus className="h-3.5 w-3.5" />
        </IconToggle>
      }
    >
      <div className="space-y-1">
        {fills.map((fill, index) => (
          <PaintRow
            key={index}
            paint={fill}
            onChange={(next) => update({ fills: fills.map((entry, at) => (at === index ? { ...entry, ...next } : entry)) }, "Fill")}
            onRemove={() => update({ fills: fills.filter((_, at) => at !== index) }, "Remove fill")}
          />
        ))}
      </div>
    </Section>
  );
}

function StrokeSection({ node, update }: { node: SceneNode; update: Update }) {
  const strokes = node.strokes;
  const addStroke = () =>
    update(
      { strokes: [...strokes, { color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, weight: 1, align: "INSIDE" } satisfies Stroke] },
      "Add stroke",
    );
  return (
    <Section title="Stroke" action={<IconToggle label="Add stroke" onClick={addStroke}><Plus className="h-3.5 w-3.5" /></IconToggle>}>
      <div className="space-y-1">
        {strokes.map((stroke, index) => (
          <div key={index} className="flex items-center gap-1">
            <PaintRow
              paint={stroke}
              onChange={(next) => update({ strokes: strokes.map((entry, at) => (at === index ? { ...entry, ...next } : entry)) }, "Stroke")}
              onRemove={() => update({ strokes: strokes.filter((_, at) => at !== index) }, "Remove stroke")}
            />
            <div className="w-14 shrink-0">
              <NumberInput
                label="W"
                value={stroke.weight}
                min={0}
                onCommit={(weight) => update({ strokes: strokes.map((entry, at) => (at === index ? { ...entry, weight } : entry)) }, "Stroke weight")}
              />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const DEFAULT_SHADOW: Effect = {
  type: "DROP_SHADOW",
  color: { r: 0, g: 0, b: 0, a: 0.15 },
  offset: { x: 0, y: 4 },
  radius: 12,
  spread: 0,
  visible: true,
} as Effect;

function ShadowSection({ node, update }: { node: SceneNode; update: Update }) {
  const shadowIndex = node.effects.findIndex((effect) => effect.type === "DROP_SHADOW");
  const shadow = shadowIndex >= 0 ? node.effects[shadowIndex] : null;
  const setShadow = (next: Effect | null) =>
    update(
      {
        effects: next
          ? shadowIndex >= 0
            ? node.effects.map((effect, at) => (at === shadowIndex ? next : effect))
            : [...node.effects, next]
          : node.effects.filter((_, at) => at !== shadowIndex),
      },
      "Shadow",
    );
  return (
    <Section
      title="Shadow"
      action={
        <IconToggle label={shadow ? "Remove shadow" : "Add shadow"} onClick={() => setShadow(shadow ? null : DEFAULT_SHADOW)}>
          {shadow ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </IconToggle>
      }
    >
      {shadow ? (
        <div className="grid grid-cols-2 gap-1.5">
          <NumberInput label="Y" value={shadow.offset.y} onCommit={(y) => setShadow({ ...shadow, offset: { ...shadow.offset, y } })} />
          <NumberInput label="Blur" value={shadow.radius} min={0} onCommit={(value) => setShadow({ ...shadow, radius: value })} />
          <NumberInput
            label="Alpha %"
            value={Math.round(shadow.color.a * 100)}
            min={0}
            max={100}
            onCommit={(value) => setShadow({ ...shadow, color: { ...shadow.color, a: value / 100 } })}
          />
        </div>
      ) : null}
    </Section>
  );
}

/** Copies the layer as React with Tailwind classes, the hand-off for an agent. */
function ExportSection({ editor, node }: { editor: Editor; node: SceneNode }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sceneNodeToJSX(node.id, editor.graph, "tailwind"));
      toast.success("Copied as React + Tailwind. Paste it to your agent to build.");
    } catch {
      toast.error("Could not copy. Allow clipboard access and try again.");
    }
  };
  return (
    <Section title="Export">
      <button
        type="button"
        onClick={() => void copy()}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 hover:bg-accent"
      >
        <Code className="h-3.5 w-3.5" /> Copy as code
      </button>
    </Section>
  );
}

// ---- small controls --------------------------------------------------------

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function IconToggle({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
      {children}
    </button>
  );
}

/**
 * A number field that commits on Enter or blur and steps with the arrow
 * keys, Shift for tens, like Figma's fields. Shows the live value until the
 * user types.
 */
function NumberInput({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next));
  const commit = (text: string) => {
    setDraft(null);
    const next = Number.parseFloat(text);
    if (Number.isFinite(next) && clamp(next) !== value) onCommit(clamp(next));
  };
  return (
    <label className="flex h-7 items-center gap-1 rounded-md bg-background/60 px-1.5 focus-within:ring-1 focus-within:ring-sky-600">
      <span className="w-auto shrink-0 text-muted-foreground">{label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none"
        inputMode="decimal"
        aria-label={label}
        value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={() => draft !== null && commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(draft ?? shown);
          if (event.key === "Escape") setDraft(null);
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
            onCommit(clamp(Math.round((Number.parseFloat(draft ?? shown) || 0) + step)));
            setDraft(null);
          }
        }}
      />
    </label>
  );
}

function TextInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() && draft !== value) onCommit(draft.trim());
    setDraft(null);
  };
  return (
    <label className="flex h-7 items-center gap-1 rounded-md bg-background/60 px-1.5 focus-within:ring-1 focus-within:ring-sky-600">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent text-right outline-none"
        aria-label={label}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-7 items-center gap-1 rounded-md bg-background/60 px-1.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-right outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function SizingInput({ label, value, onChange }: { label: string; value: LayoutSizing; onChange: (value: LayoutSizing) => void }) {
  return (
    <SelectInput
      label={label}
      value={value}
      options={[
        ["FIXED", "Fixed"],
        ["HUG", "Hug"],
        ["FILL", "Fill"],
      ]}
      onChange={(next) => onChange(next as LayoutSizing)}
    />
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-md bg-background/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          title={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("rounded p-1", value === option.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

/**
 * One paint, a fill or a stroke: swatch, hex, remove. A gradient or image
 * fill shows its type. Strokes are always solid.
 */
function PaintRow({
  paint,
  onChange,
  onRemove,
}: {
  paint: { color: Color; type?: Fill["type"] };
  onChange: (next: { color: Color }) => void;
  onRemove: () => void;
}) {
  const hex = paint.type === undefined || paint.type === "SOLID" ? toHex(paint.color) : null;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    setDraft(null);
    const color = fromHex(text);
    if (color) onChange({ color: { ...color, a: paint.color.a } });
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background/60 px-1.5 py-1">
      {hex ? (
        <input
          type="color"
          aria-label="Color"
          value={hex.toLowerCase()}
          onChange={(event) => commit(event.target.value)}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded bg-gradient-to-br from-zinc-300 to-zinc-600" />
      )}
      {hex ? (
        <input
          aria-label="Hex color"
          className="min-w-0 flex-1 bg-transparent uppercase outline-none"
          value={draft ?? hex.slice(1)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => draft !== null && commit(draft)}
          onKeyDown={(event) => event.key === "Enter" && commit(draft ?? hex)}
        />
      ) : (
        <span className="flex-1 text-muted-foreground">{paint.type?.toLowerCase().replace("_", " ")}</span>
      )}
      <button type="button" aria-label="Remove" className="text-muted-foreground hover:text-foreground" onClick={onRemove}>
        <Minus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
