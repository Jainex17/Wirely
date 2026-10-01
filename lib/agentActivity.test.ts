import { describe, expect, it } from "bun:test";
import {
  describeAgentCall,
  describePatch,
  groupAgentActivity,
  type AgentActivityEntry,
} from "@/lib/agentActivity";

const entry = (
  id: string,
  tool: string,
  pageId: string | null,
  error: string | null = null,
  detail: string | null = null,
) => ({ id, tool, pageId, error, detail, createdAt: "2026-09-29T10:00:00.000Z" }) satisfies AgentActivityEntry;

describe("groupAgentActivity", () => {
  it("folds a run of identical calls and keeps errors and other pages apart", () => {
    const rows = groupAgentActivity([
      entry("1", "patch_page", "a"),
      entry("2", "patch_page", "a"),
      entry("3", "patch_page", "a", "oldString was not found"),
      entry("4", "patch_page", "a"),
      entry("5", "patch_page", "b"),
      entry("6", "patch_page", "a"),
    ]);

    expect(rows.map((row) => [row.id, row.count])).toEqual([
      ["1", 2],
      ["3", 1],
      ["4", 1],
      ["5", 1],
      ["6", 1],
    ]);
  });

  it("keeps each folded call's distinct detail, newest first", () => {
    const [row] = groupAgentActivity([
      entry("1", "patch_page", "a", null, "Changed styles"),
      entry("2", "patch_page", "a", null, 'Added "Pricing"'),
      entry("3", "patch_page", "a", null, "Changed styles"),
      entry("4", "patch_page", "a"),
    ]);
    expect(row.count).toBe(4);
    expect(row.details).toEqual(["Changed styles", 'Added "Pricing"']);
  });
});

describe("describePatch", () => {
  it("names the text that changed", () => {
    expect(describePatch("<h1>Ship faster</h1>", "<h1>Ship today</h1>")).toBe(
      '"Ship faster" to "Ship today"',
    );
    expect(describePatch("<p>Hi</p>", "<p>Hi</p><p>There</p>")).toBe('Added "There"');
    expect(describePatch("<section><h2>FAQ</h2></section>", "")).toBe('Removed "FAQ"');
  });

  it("tells a style change from a markup change when the text is the same", () => {
    expect(describePatch('<a class="px-2">Go</a>', '<a class="px-4">Go</a>')).toBe("Changed styles");
    expect(describePatch("<a>Go</a>", '<a href="#x">Go</a>')).toBe("Changed the markup");
    // Agents often patch only an attribute, with no tag around it.
    expect(describePatch('class="text-6xl"', 'class="text-7xl tracking-tight"')).toBe("Changed styles");
  });

  it("ignores script and style contents", () => {
    expect(describePatch("<style>.a{}</style>", "<style>.b{}</style>")).toBe("Changed the markup");
  });
});

describe("describeAgentCall", () => {
  it("prefers the agent's note and clips it", () => {
    expect(describeAgentCall("patch_page", { note: "  Tighten   hero spacing ", oldString: "a" })).toBe(
      "Tighten hero spacing",
    );
    expect(describeAgentCall("patch_page", { note: "x".repeat(400) })?.length).toBe(160);
  });

  it("works out a description from the arguments without a note", () => {
    expect(describeAgentCall("update_page", { title: "Home v2" })).toBe('Renamed to "Home v2"');
    expect(describeAgentCall("update_page", { html: "<html></html>" })).toBe("Rewrote the whole page");
    expect(describeAgentCall("edit_element", { action: "wrap" })).toBe("Wrapped an element in a frame");
    expect(describeAgentCall("import_url", { url: "https://stripe.com/pricing" })).toBe("stripe.com");
    expect(describeAgentCall("get_page", {})).toBeNull();
  });
});
