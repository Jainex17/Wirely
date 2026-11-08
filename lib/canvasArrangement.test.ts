import { describe, expect, it } from "bun:test";

import { PAGE_GAP } from "@/lib/canvasScene";
import {
  ARRANGEMENT_GROUP_GAP,
  checkArrangementPages,
  layoutArrangement,
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
    const secondRowY = 2000 + ARRANGEMENT_GROUP_GAP;
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
    expect(pagePositions.d1).toEqual({ x: 0, y: 2000 + ARRANGEMENT_GROUP_GAP });
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
});
