/**
 * The distances the canvas draws between the picked element and the one under
 * the pointer while Alt is held, the way Figma measures. Elements that overlap,
 * such as a child inside its parent, get one line per side between matching
 * edges. Elements apart get the gap between their facing edges.
 */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A horizontal or vertical line in page px, with its length rounded for the label. */
export interface MeasureLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
}

const line = (x1: number, y1: number, x2: number, y2: number): MeasureLine => ({
  x1,
  y1,
  x2,
  y2,
  length: Math.round(Math.hypot(x2 - x1, y2 - y1) * 10) / 10,
});

export const measureBetween = (from: Rect, to: Rect): MeasureLine[] => {
  const fromRight = from.x + from.width;
  const fromBottom = from.y + from.height;
  const toRight = to.x + to.width;
  const toBottom = to.y + to.height;
  const overlapsX = from.x < toRight && to.x < fromRight;
  const overlapsY = from.y < toBottom && to.y < fromBottom;
  // Lines run through the middle of the shared span, else through the picked element.
  const midX = overlapsX
    ? (Math.max(from.x, to.x) + Math.min(fromRight, toRight)) / 2
    : from.x + from.width / 2;
  const midY = overlapsY
    ? (Math.max(from.y, to.y) + Math.min(fromBottom, toBottom)) / 2
    : from.y + from.height / 2;

  const lines: MeasureLine[] = [];
  if (overlapsX && overlapsY) {
    lines.push(
      line(Math.min(from.x, to.x), midY, Math.max(from.x, to.x), midY),
      line(Math.min(fromRight, toRight), midY, Math.max(fromRight, toRight), midY),
      line(midX, Math.min(from.y, to.y), midX, Math.max(from.y, to.y)),
      line(midX, Math.min(fromBottom, toBottom), midX, Math.max(fromBottom, toBottom)),
    );
  } else {
    if (!overlapsX) {
      lines.push(
        fromRight <= to.x ? line(fromRight, midY, to.x, midY) : line(toRight, midY, from.x, midY),
      );
    }
    if (!overlapsY) {
      lines.push(
        fromBottom <= to.y ? line(midX, fromBottom, midX, to.y) : line(midX, toBottom, midX, from.y),
      );
    }
  }
  return lines.filter((entry) => entry.length > 0);
};
