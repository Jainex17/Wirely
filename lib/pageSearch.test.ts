import { describe, expect, it } from "bun:test";
import { matchesPageSearch } from "@/lib/pageSearch";

describe("matchesPageSearch", () => {
  it("finds a page by every word of the query, in any order and case", () => {
    expect(matchesPageSearch("blue r1", "R1 · 06 · Blueprint")).toBe(true);
    expect(matchesPageSearch("r1 cinema", "R1 · 06 · Blueprint")).toBe(false);
  });

  it("finds every page of a group by the group's name", () => {
    expect(matchesPageSearch("current site", "Docs", "Current site")).toBe(true);
    expect(matchesPageSearch("logos", "Docs", "Current site")).toBe(false);
  });

  it("matches everything while the query is blank", () => {
    expect(matchesPageSearch("   ", "Anything")).toBe(true);
  });
});
