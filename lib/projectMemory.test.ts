import { describe, expect, it } from "bun:test";
import { formatMemoryForAgent, MAX_RULES, mergeMemoryUpdate, parseProjectMemory } from "@/lib/projectMemory";

describe("parseProjectMemory", () => {
  it("trims context and drops blank rules", () => {
    expect(parseProjectMemory({ context: "  A budgeting app  ", rules: [" No gradients ", "  "] })).toEqual({
      ok: true,
      memory: { context: "A budgeting app", rules: ["No gradients"] },
    });
  });

  it("rejects bodies that are not context plus a list of strings", () => {
    expect(parseProjectMemory(null).ok).toBe(false);
    expect(parseProjectMemory({ context: 1, rules: [] }).ok).toBe(false);
    expect(parseProjectMemory({ context: "", rules: [1] }).ok).toBe(false);
    expect(parseProjectMemory({ context: "", rules: Array(MAX_RULES + 1).fill("x") }).ok).toBe(false);
  });
});

describe("mergeMemoryUpdate", () => {
  const current = { context: "A budgeting app", rules: ["No gradients"] };

  it("keeps the fields an agent leaves out", () => {
    expect(mergeMemoryUpdate(current, { addRules: ["Square corners"] })).toEqual({
      ok: true,
      memory: { context: "A budgeting app", rules: ["No gradients", "Square corners"] },
    });
    expect(mergeMemoryUpdate(current, { context: "A savings app" })).toEqual({
      ok: true,
      memory: { context: "A savings app", rules: ["No gradients"] },
    });
  });

  it("replaces the rules when sent, and an empty list clears them", () => {
    expect(mergeMemoryUpdate(current, { rules: [] })).toEqual({
      ok: true,
      memory: { context: "A budgeting app", rules: [] },
    });
  });

  it("rejects an empty update and rules with addRules together", () => {
    expect(mergeMemoryUpdate(current, {}).ok).toBe(false);
    expect(mergeMemoryUpdate(current, { rules: [], addRules: ["x"] }).ok).toBe(false);
  });
});

describe("formatMemoryForAgent", () => {
  it("tells the agent when there is nothing to follow", () => {
    expect(formatMemoryForAgent("Shop", { context: "", rules: [] }, null)).toContain("no memory yet");
  });

  it("lists context, rules, and tokens", () => {
    const text = formatMemoryForAgent(
      "Shop",
      { context: "Store for plants", rules: ["Square corners"] },
      { "--color-primary": "#166534" },
    );
    expect(text).toContain("Store for plants");
    expect(text).toContain("- Square corners");
    expect(text).toContain("--color-primary: #166534");
  });
});
