import { describe, expect, it } from "bun:test";
import {
  applyMatrix,
  buildPenPath,
  invertMatrix,
  moveAnchor,
  moveControl,
  parsePath,
  serializePath,
} from "@/lib/vectorPath";

describe("parsePath", () => {
  it("turns relative and shorthand commands into absolute segments", () => {
    const segments = parsePath("m10 10 h5v5 l-5 0 s-2 -4 0 -5 t1 1 z") ?? [];
    expect(serializePath(segments)).toBe("M10 10L15 10L15 15L10 15C10 15 8 11 10 10Q10 10 11 11Z");
  });

  it("reads compact arc flags and implicit linetos", () => {
    expect(serializePath(parsePath("M0 0 1 1a5 5 0 011 1") ?? [])).toBe("M0 0L1 1A5 5 0 0 1 2 2");
  });

  it("rejects malformed data", () => {
    expect(parsePath("L1 1")).toBeNull();
    expect(parsePath("M1")).toBeNull();
  });
});

describe("editing", () => {
  it("moves an anchor with its handles and keeps a closed shape closed", () => {
    const segments = parsePath("M0 0C0 5 5 10 10 10C15 10 20 5 20 0L0 0Z") ?? [];
    const moved = moveAnchor(segments, 0, 1, 1);
    // The start, its outgoing handle, and the closing point all move.
    expect(serializePath(moved)).toBe("M1 1C1 6 5 10 10 10C15 10 20 5 20 0L1 1Z");
    const middle = moveAnchor(segments, 1, 0, 2);
    expect(serializePath(middle)).toBe("M0 0C0 5 5 12 10 12C15 12 20 5 20 0L0 0Z");
    expect(serializePath(moveControl(segments, 2, "c2", { x: 9, y: 9 }))).toBe(
      "M0 0C0 5 5 10 10 10C15 10 9 9 20 0L0 0Z",
    );
  });

  it("round-trips a point through a matrix", () => {
    const matrix = [2, 0, 0, 2, 5, -5] as const;
    const inverse = invertMatrix([...matrix]);
    expect(inverse).not.toBeNull();
    expect(applyMatrix(inverse!, applyMatrix([...matrix], { x: 3, y: 4 }))).toEqual({ x: 3, y: 4 });
  });
});

describe("buildPenPath", () => {
  it("draws corners as lines and dragged points as curves, closing back to the start", () => {
    expect(buildPenPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], false)).toBe("M0 0L10 0");
    expect(
      buildPenPath([{ x: 0, y: 0 }, { x: 10, y: 0, handle: { x: 15, y: 5 } }, { x: 10, y: 10 }], true),
    ).toBe("M0 0C0 0 5 -5 10 0C15 5 10 10 10 10L0 0Z");
  });
});
