import { describe, expect, it } from "bun:test";

import { PAGE_FRAME_TOP, PAGE_GAP } from "@/lib/canvasScene";
import {
  ARRANGEMENT_GROUP_GAP,
  ARRANGEMENT_ROW_GAP,
  checkArrangementPages,
  layoutArrangement,
  mergeTabArrangement,
  rowsArrangedSince,
} from "@/lib/canvasArrangement";

const SIZES: Record<string, { width: number; height: number }> = {
  m1: { width: 375, height: 2000 },
  m2: { width: 375, height: 812 },
  m3: { width: 375, height: 1500 },
  d1: { width: 1440, height: 900 },
  d2: { width: 1440, height: 3000 },
};
const sizeOf = (pageId: string) => SIZES[pageId];

describe("layoutArrangement", () => {
  it("puts mobile groups on the first row and desktop pages under the tallest mobile page", () => {
    const { pagePositions, pageGroups } = layoutArrangement(
      [
        [
          { name: "Onboarding", pageIds: ["m1", "m2"] },
          { name: "Checkout", pageIds: ["m3"] },
        ],
        [{ name: "Website", pageIds: ["d1", "d2"] }],
      ],
      ["d1", "m1", "m2", "d2", "m3"],
      sizeOf,
    );

    expect(pagePositions.m1).toEqual({ x: 0, y: 0 });
    expect(pagePositions.m2).toEqual({ x: 375 + PAGE_GAP, y: 0 });
    expect(pagePositions.m3).toEqual({ x: 375 * 2 + PAGE_GAP + ARRANGEMENT_GROUP_GAP, y: 0 });
    const secondRowY = PAGE_FRAME_TOP + 2000 + ARRANGEMENT_ROW_GAP;
    expect(pagePositions.d1).toEqual({ x: 0, y: secondRowY });
    expect(pagePositions.d2).toEqual({ x: 1440 + PAGE_GAP, y: secondRowY });
    expect(pageGroups.map((group) => [group.name, group.pageIds])).toEqual([
      ["Onboarding", ["m1", "m2"]],
      ["Checkout", ["m3"]],
      ["Website", ["d1", "d2"]],
    ]);
  });

  it("places pages without a frame when the group has no name, and left out pages in a last row", () => {
    const { pagePositions, pageGroups } = layoutArrangement(
      [[{ pageIds: ["m1"] }]],
      ["m1", "d1"],
      sizeOf,
    );

    expect(pageGroups).toEqual([]);
    expect(pagePositions.d1).toEqual({ x: 0, y: PAGE_FRAME_TOP + 2000 + ARRANGEMENT_ROW_GAP });
  });

  it("skips pages deleted since the agent asked, without leaving a gap or an empty row", () => {
    const { pagePositions, pageGroups } = layoutArrangement(
      [[{ name: "Gone", pageIds: ["deleted"] }], [{ name: "Kept", pageIds: ["deleted-too", "d1"] }]],
      ["d1"],
      sizeOf,
    );

    expect(pagePositions).toEqual({ d1: { x: 0, y: 0 } });
    expect(pageGroups.map((group) => group.pageIds)).toEqual([["d1"]]);
  });
});

describe("checkArrangementPages", () => {
  it("reports unknown, repeated, and left out ids", () => {
    expect(
      checkArrangementPages([[{ pageIds: ["a", "x"] }, { pageIds: ["a"] }]], ["a", "b"]),
    ).toEqual({ unknown: ["x"], repeated: ["a"], unlisted: ["b"] });
  });

  it("counts only the arranged tab's pages as left out", () => {
    expect(
      checkArrangementPages([[{ pageIds: ["a"] }]], ["a", "b", "c"], ["a", "b"]),
    ).toEqual({ unknown: [], repeated: [], unlisted: ["b"] });
  });
});

describe("mergeTabArrangement", () => {
  const onTabB = (pageId: string) => pageId.startsWith("b");

  const AT = "2026-11-09T15:00:00.000Z";

  it("keeps other tabs' rows and replaces this tab's, stamping the new ones", () => {
    const previous = [[{ name: "Onboarding", pageIds: ["a1", "a2"], at: "2026-11-09T14:00:00.000Z" }], [{ pageIds: ["b1"] }]];
    const next = [[{ name: "Checkout", pageIds: ["b2", "b1"] }]];
    expect(mergeTabArrangement(previous, next, onTabB, AT)).toEqual([
      [{ name: "Onboarding", pageIds: ["a1", "a2"], at: "2026-11-09T14:00:00.000Z" }],
      [{ name: "Checkout", pageIds: ["b2", "b1"], at: AT }],
    ]);
  });

  it("drops a page that moved onto this tab from its old group", () => {
    const previous = [[{ name: "Mixed", pageIds: ["a1", "b9"] }]];
    expect(mergeTabArrangement(previous, [[{ pageIds: ["b1"] }]], onTabB, AT)).toEqual([
      [{ name: "Mixed", pageIds: ["a1"] }],
      [{ pageIds: ["b1"], at: AT }],
    ]);
  });

  it("starts from nothing and stays within the row limit", () => {
    expect(mergeTabArrangement(null, [[{ pageIds: ["b1"] }]], onTabB, AT)).toEqual([
      [{ pageIds: ["b1"], at: AT }],
    ]);
    const previous = Array.from({ length: 20 }, (_, index) => [{ pageIds: [`a${index}`] }]);
    const merged = mergeTabArrangement(previous, [[{ pageIds: ["b1"] }]], onTabB, AT);
    expect(merged.length).toBe(20);
    expect(merged[0]).toEqual([{ pageIds: ["a1"] }]);
    expect(merged[19]).toEqual([{ pageIds: ["b1"], at: AT }]);
  });
});

describe("rowsArrangedSince", () => {
  const rows = [
    [{ name: "Onboarding", pageIds: ["a1"], at: "2026-11-09T14:00:00.000Z" }],
    [{ name: "Checkout", pageIds: ["b1"], at: "2026-11-09T15:00:00.000Z" }],
  ];

  it("keeps only the groups arranged after the editor last applied", () => {
    expect(rowsArrangedSince(rows, "2026-11-09T14:30:00.000Z")).toEqual([rows[1]]);
  });

  it("keeps every group for an editor that never applied one, or for rows without times", () => {
    expect(rowsArrangedSince(rows, null)).toEqual(rows);
    const legacy = [[{ pageIds: ["a1"] }]];
    expect(rowsArrangedSince(legacy, "2026-11-09T14:30:00.000Z")).toEqual(legacy);
  });
});
