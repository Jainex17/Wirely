import { describe, expect, it } from "bun:test";
import { groupAgentActivity, type AgentActivityEntry } from "@/lib/agentActivity";

const entry = (id: string, tool: string, pageId: string | null, error: string | null = null) =>
  ({ id, tool, pageId, error, createdAt: "2026-09-29T10:00:00.000Z" }) satisfies AgentActivityEntry;

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
});
