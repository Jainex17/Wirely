import { describe, expect, it } from "bun:test";
import { parseBatchWireOutput, parseWireOutput } from "@/lib/wireOutput";

describe("parseWireOutput", () => {
  it("extracts details from content before HTML marker when DETAILS marker is missing", () => {
    const raw = `The Nexus Admin Console presents a technical-grid aesthetic with deep slate and electric sky-blue accents.

HTML:
<!doctype html><html><body><main>Dashboard</main></body></html>`;

    const parsed = parseWireOutput(raw);
    expect(parsed.details).toContain("Nexus Admin Console");
    expect(parsed.html).toContain("<!doctype html>");
  });

  it("extracts details between DETAILS and HTML markers", () => {
    const raw = `DETAILS:
Summary text.
HTML:
<!doctype html><html><body><main>Page</main></body></html>`;

    const parsed = parseWireOutput(raw);
    expect(parsed.details).toBe("Summary text.");
    expect(parsed.html).toContain("<main>Page</main>");
  });

  it("extracts title and batch html sections when planner metadata is present", () => {
    const raw = `DETAILS:
Two concepts explore the product with distinct visual systems.
TITLE_1:
Signal Grid
HTML_1:
<!doctype html><html><body><main>First</main></body></html>
TITLE_2:
Editorial Analyst
HTML_2:
<!doctype html><html><body><main>Second</main></body></html>`;

    const parsed = parseBatchWireOutput(raw, 2);
    expect(parsed.details).toBe(
      "Two concepts explore the product with distinct visual systems.",
    );
    expect(parsed.titleByIndex).toEqual(["Signal Grid", "Editorial Analyst"]);
    expect(parsed.htmlByIndex[0]).toContain("<main>First</main>");
    expect(parsed.htmlByIndex[1]).toContain("<main>Second</main>");
  });

  it("treats plain text responses as details when no markers exist", () => {
    const raw =
      "LyricFlow is a sleek, dark-themed application workspace featuring a slate and steel palette with electric sky-blue accents.";

    const parsed = parseWireOutput(raw);
    expect(parsed.details).toContain("LyricFlow is a sleek, dark-themed");
  });
});
