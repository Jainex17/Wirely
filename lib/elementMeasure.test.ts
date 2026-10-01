import { describe, expect, it } from "bun:test";
import { measureBetween } from "@/lib/elementMeasure";

describe("measureBetween", () => {
  it("measures the gap to an element on the right, through the shared span", () => {
    expect(
      measureBetween({ x: 0, y: 0, width: 100, height: 40 }, { x: 124, y: 20, width: 50, height: 40 }),
    ).toEqual([{ x1: 100, y1: 30, x2: 124, y2: 30, length: 24 }]);
  });

  it("measures the gap to an element above", () => {
    expect(
      measureBetween({ x: 0, y: 100, width: 100, height: 40 }, { x: 0, y: 0, width: 100, height: 60 }),
    ).toEqual([{ x1: 50, y1: 60, x2: 50, y2: 100, length: 40 }]);
  });

  it("measures both gaps to a diagonal element", () => {
    const lines = measureBetween(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 30, y: 50, width: 10, height: 10 },
    );
    expect(lines.map((entry) => entry.length)).toEqual([20, 40]);
  });

  it("measures a child to each side of its parent", () => {
    const lines = measureBetween(
      { x: 16, y: 8, width: 68, height: 24 },
      { x: 0, y: 0, width: 100, height: 40 },
    );
    expect(lines.map((entry) => entry.length)).toEqual([16, 16, 8, 8]);
  });

  it("drops sides that line up and gaps of zero", () => {
    expect(
      measureBetween({ x: 0, y: 0, width: 100, height: 20 }, { x: 0, y: 0, width: 100, height: 40 }),
    ).toEqual([{ x1: 50, y1: 20, x2: 50, y2: 40, length: 20 }]);
    expect(
      measureBetween({ x: 0, y: 0, width: 100, height: 40 }, { x: 100, y: 0, width: 50, height: 40 }),
    ).toEqual([]);
  });
});
