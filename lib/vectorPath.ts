/**
 * Path geometry for the pen tool. Parses an SVG `d` into absolute segments the
 * editor can drag, and writes them back. Only the path being edited is
 * rewritten; every other element keeps its source exactly as the agent wrote
 * it. H and V become L, S becomes C, and T becomes Q on the edited path, since
 * a dragged point no longer lines up with the shorthand.
 */

export interface Point {
  x: number;
  y: number;
}

/** An SVG transform [a, b, c, d, e, f]. */
export type Matrix = [number, number, number, number, number, number];

export type Segment =
  | { type: "M"; to: Point }
  | { type: "L"; to: Point }
  | { type: "C"; c1: Point; c2: Point; to: Point }
  | { type: "Q"; c: Point; to: Point }
  | {
      type: "A";
      rx: number;
      ry: number;
      rotation: number;
      largeArc: number;
      sweep: number;
      to: Point;
    }
  | { type: "Z" };

export type ControlKey = "c1" | "c2" | "c";

const ARG_COUNTS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;
const SEPARATOR = /[\s,]*/y;

/** Parses `d` into absolute segments, or null when it is malformed. */
export const parsePath = (d: string): Segment[] | null => {
  const segments: Segment[] = [];
  let index = 0;
  const skip = () => {
    SEPARATOR.lastIndex = index;
    SEPARATOR.exec(d);
    index = SEPARATOR.lastIndex;
  };
  const readNumber = () => {
    skip();
    NUMBER.lastIndex = index;
    const match = NUMBER.exec(d);
    if (!match) return null;
    index = NUMBER.lastIndex;
    return Number.parseFloat(match[0]);
  };
  // Arc flags are single digits and may run together, as in "a1 1 0 011 1".
  const readFlag = () => {
    skip();
    const char = d[index];
    if (char !== "0" && char !== "1") return null;
    index += 1;
    return Number(char);
  };

  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let command = "";
  skip();
  while (index < d.length) {
    if (/[a-z]/i.test(d[index])) {
      command = d[index];
      index += 1;
    } else if (!command || command === "z" || command === "Z") {
      return null;
    }
    const lower = command.toLowerCase();
    const relative = command === lower;
    const args: number[] = [];
    for (let arg = 0; arg < ARG_COUNTS[lower]; arg += 1) {
      const value = lower === "a" && (arg === 3 || arg === 4) ? readFlag() : readNumber();
      if (value === null) return null;
      args.push(value);
    }
    const point = (x: number, y: number): Point =>
      relative ? { x: current.x + x, y: current.y + y } : { x, y };
    const previous = segments.at(-1);

    switch (lower) {
      case "m":
        current = point(args[0], args[1]);
        start = current;
        segments.push({ type: "M", to: current });
        // Pairs after a moveto are implicit linetos.
        command = relative ? "l" : "L";
        break;
      case "l":
        current = point(args[0], args[1]);
        segments.push({ type: "L", to: current });
        break;
      case "h":
        current = { x: relative ? current.x + args[0] : args[0], y: current.y };
        segments.push({ type: "L", to: current });
        break;
      case "v":
        current = { x: current.x, y: relative ? current.y + args[0] : args[0] };
        segments.push({ type: "L", to: current });
        break;
      case "c": {
        const segment = {
          type: "C" as const,
          c1: point(args[0], args[1]),
          c2: point(args[2], args[3]),
          to: point(args[4], args[5]),
        };
        segments.push(segment);
        current = segment.to;
        break;
      }
      case "s": {
        const c1 =
          previous?.type === "C"
            ? { x: 2 * current.x - previous.c2.x, y: 2 * current.y - previous.c2.y }
            : current;
        const segment = { type: "C" as const, c1, c2: point(args[0], args[1]), to: point(args[2], args[3]) };
        segments.push(segment);
        current = segment.to;
        break;
      }
      case "q": {
        const segment = { type: "Q" as const, c: point(args[0], args[1]), to: point(args[2], args[3]) };
        segments.push(segment);
        current = segment.to;
        break;
      }
      case "t": {
        const c =
          previous?.type === "Q"
            ? { x: 2 * current.x - previous.c.x, y: 2 * current.y - previous.c.y }
            : current;
        const segment = { type: "Q" as const, c, to: point(args[0], args[1]) };
        segments.push(segment);
        current = segment.to;
        break;
      }
      case "a": {
        const segment = {
          type: "A" as const,
          rx: args[0],
          ry: args[1],
          rotation: args[2],
          largeArc: args[3],
          sweep: args[4],
          to: point(args[5], args[6]),
        };
        segments.push(segment);
        current = segment.to;
        break;
      }
      case "z":
        segments.push({ type: "Z" });
        current = start;
        break;
      default:
        return null;
    }
    skip();
  }
  return segments[0]?.type === "M" ? segments : null;
};

const formatNumber = (value: number) => String(Math.round(value * 100) / 100);
const formatPoint = (point: Point) => `${formatNumber(point.x)} ${formatNumber(point.y)}`;

export const serializePath = (segments: Segment[]) =>
  segments
    .map((segment) => {
      switch (segment.type) {
        case "M":
        case "L":
          return `${segment.type}${formatPoint(segment.to)}`;
        case "C":
          return `C${formatPoint(segment.c1)} ${formatPoint(segment.c2)} ${formatPoint(segment.to)}`;
        case "Q":
          return `Q${formatPoint(segment.c)} ${formatPoint(segment.to)}`;
        case "A":
          return `A${[segment.rx, segment.ry, segment.rotation].map(formatNumber).join(" ")} ${segment.largeArc} ${segment.sweep} ${formatPoint(segment.to)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");

const add = (point: Point, dx: number, dy: number): Point => ({ x: point.x + dx, y: point.y + dy });
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** The subpath around `index`, from its moveto up to the next one. */
const subpathRange = (segments: Segment[], index: number) => {
  let first = index;
  while (first > 0 && segments[first].type !== "M") first -= 1;
  let last = index;
  while (last + 1 < segments.length && segments[last + 1].type !== "M") last += 1;
  return { first, last };
};

/**
 * Moves the anchor ending segment `index` by (dx, dy), with the handles that
 * belong to it: its own incoming control and the next segment's outgoing one.
 * An anchor sitting exactly on another in the same subpath, as the closing
 * point of a shape drawn back to its start, moves with it so the shape stays
 * closed.
 */
export const moveAnchor = (segments: Segment[], index: number, dx: number, dy: number) => {
  const target = segments[index];
  if (!target || target.type === "Z") return segments;
  const { first, last } = subpathRange(segments, index);
  const moved = new Set<number>();
  for (let at = first; at <= last; at += 1) {
    const segment = segments[at];
    if (segment.type !== "Z" && samePoint(segment.to, target.to)) moved.add(at);
  }

  return segments.map((segment, at) => {
    if (segment.type === "Z") return segment;
    let next: Exclude<Segment, { type: "Z" }> = segment;
    if (moved.has(at)) {
      next = { ...next, to: add(segment.to, dx, dy) };
      if (next.type === "C") next = { ...next, c2: add(next.c2, dx, dy) };
    }
    if (next.type === "C" && moved.has(at - 1)) next = { ...next, c1: add(next.c1, dx, dy) };
    return next;
  });
};

/** Moves one bezier control point to `to`. */
export const moveControl = (segments: Segment[], index: number, key: ControlKey, to: Point) =>
  segments.map((segment, at) => {
    if (at !== index) return segment;
    if (segment.type === "C" && (key === "c1" || key === "c2")) return { ...segment, [key]: to };
    if (segment.type === "Q" && key === "c") return { ...segment, c: to };
    return segment;
  });

export const applyMatrix = ([a, b, c, d, e, f]: Matrix, point: Point): Point => ({
  x: a * point.x + c * point.y + e,
  y: b * point.x + d * point.y + f,
});

export const invertMatrix = ([a, b, c, d, e, f]: Matrix): Matrix | null => {
  const determinant = a * d - b * c;
  if (!determinant) return null;
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
};

/** A point the pen placed. A drag gives it an outgoing handle, mirrored for the incoming side. */
export interface PenAnchor {
  x: number;
  y: number;
  handle?: Point;
}

const incoming = (anchor: PenAnchor): Point =>
  anchor.handle ? { x: 2 * anchor.x - anchor.handle.x, y: 2 * anchor.y - anchor.handle.y } : anchor;

const penSegment = (from: PenAnchor, to: PenAnchor): Segment =>
  from.handle || to.handle
    ? { type: "C", c1: from.handle ?? from, c2: incoming(to), to: { x: to.x, y: to.y } }
    : { type: "L", to: { x: to.x, y: to.y } };

/** The `d` for the points the pen has placed, closed back to the first when `closed`. */
export const buildPenPath = (anchors: PenAnchor[], closed: boolean) => {
  if (anchors.length === 0) return "";
  const segments: Segment[] = [{ type: "M", to: { x: anchors[0].x, y: anchors[0].y } }];
  for (let index = 1; index < anchors.length; index += 1) {
    segments.push(penSegment(anchors[index - 1], anchors[index]));
  }
  if (closed && anchors.length > 2) {
    segments.push(penSegment(anchors[anchors.length - 1], anchors[0]), { type: "Z" });
  }
  return serializePath(segments);
};
