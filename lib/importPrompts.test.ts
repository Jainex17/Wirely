import { describe, expect, it } from "bun:test";
import { buildAgentImportPrompt } from "@/lib/importPrompts";

const editor = "https://wirely.site/wire/p1";

describe("buildAgentImportPrompt", () => {
  it("names the project and the tool for each source", () => {
    expect(buildAgentImportPrompt("live_app", editor, " http://localhost:5173/dashboard ")).toBe(
      "Capture http://localhost:5173/dashboard from my running app into the Wirely project " +
        "https://wirely.site/wire/p1 with capture_local_page, and give me the link to the new page.",
    );
    expect(buildAgentImportPrompt("codebase", editor, "")).toContain("add_page");
    expect(buildAgentImportPrompt("figma", editor, "https://figma.com/design/abc")).toContain(
      "https://figma.com/design/abc",
    );
  });

  it("falls back to a default when the user leaves the link empty", () => {
    expect(buildAgentImportPrompt("live_app", editor, "")).toContain("http://localhost:3000");
  });
});
