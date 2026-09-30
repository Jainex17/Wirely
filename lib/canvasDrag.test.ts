import { describe, expect, it } from "bun:test";
import { findDropTarget } from "@/lib/canvasDrag";

const box = (nodeId: string, x: number, y: number) => ({ nodeId, x, y, width: 100, height: 40 });

describe("findDropTarget", () => {
  const column = [box("a", 0, 0), box("b", 0, 50), box("c", 0, 100)];

  it("lands before or after the nearest sibling along the axis", () => {
    expect(findDropTarget(column, "a", "column", { x: 50, y: 125 })).toMatchObject({
      targetId: "c",
      position: "after",
      line: { x: 0, y: 139, width: 100, height: 2 },
    });
    expect(findDropTarget(column, "c", "column", { x: 50, y: 5 })).toMatchObject({
      targetId: "a",
      position: "before",
    });
  });

  it("returns null where the element already is, or with no siblings", () => {
    expect(findDropTarget(column, "a", "column", { x: 50, y: 55 })).toBeNull();
    expect(findDropTarget(column, "b", "column", { x: 50, y: 30 })).toBeNull();
    expect(findDropTarget([box("a", 0, 0)], "a", "column", { x: 0, y: 0 })).toBeNull();
  });

  it("uses x for rows and grids", () => {
    const grid = [box("a", 0, 0), box("b", 110, 0), box("c", 0, 50), box("d", 110, 50)];
    expect(findDropTarget(grid, "a", "row", { x: 200, y: 60 })).toMatchObject({
      targetId: "d",
      position: "after",
      line: { x: 209, y: 50, width: 2, height: 40 },
    });
  });
});
