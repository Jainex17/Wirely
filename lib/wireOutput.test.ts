import { describe, expect, it } from "bun:test";
import {
  extractStreamingHtml,
  normalizeGeneratedHtml,
  parseBatchWireOutput,
  parseWireOutput,
  summarizeAssistantDetails,
} from "@/lib/wireOutput";

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

  it("keeps stock-slot placeholders while removing disallowed bitmap sources", () => {
    const raw = `<!doctype html><html><body>
      <img data-wirely-stock-slot="hero-1" src="wirely-stock://hero-1" />
      <img src="https://evil.example.com/tracker.png" />
      <img src="https://images.unsplash.com/photo-1" />
    </body></html>`;

    const normalized = normalizeGeneratedHtml(raw, { allowImages: true });
    expect(normalized.html).toContain('src="wirely-stock://hero-1"');
    expect(normalized.html).toContain("images.unsplash.com/photo-1");
    expect(normalized.html).not.toContain("evil.example.com/tracker.png");
  });

  it("wraps body content in a main landmark when the model omits one", () => {
    const raw = "<!doctype html><html><body><section><h1>Page</h1></section></body></html>";

    const normalized = normalizeGeneratedHtml(raw, { allowImages: true });

    expect(normalized.html).toContain("<main>");
    expect(normalized.html).toContain("<section><h1>Page</h1></section>");
  });

  it("compresses repair-log details into a concise page summary", () => {
    const summary = summarizeAssistantDetails({
      content: `DETAILS:
The HTML page has been repaired to address the critique points: 1. Missing header landmark: a <header> element has been added. 2. Missing footer landmark: a <footer> element has been added. 3. Generic typography setup: the Inter font has been imported.
HTML:
<!doctype html><html><body><main>Page</main></body></html>`,
      fallbackTitle: "Signal Grid",
    });

    expect(summary).toBe(
      "Signal Grid now feels clearer and more complete, with stronger hierarchy and a more polished page structure.",
    );
  });

  it("returns an empty summary for empty content instead of a fabricated sentence", () => {
    expect(summarizeAssistantDetails({ content: "" })).toBe("");
  });

  it("returns an empty summary for html-only content without details", () => {
    const summary = summarizeAssistantDetails({
      content: "<!doctype html><html><body><main>Page</main></body></html>",
    });
    expect(summary).toBe("");
  });
});

describe("extractStreamingHtml", () => {
  it("returns nothing until the body has started", () => {
    expect(extractStreamingHtml("DETAILS:\nA calm finance dashboard.\nTITLE: Home\nHTML:\n")).toBe(
      "",
    );
    expect(
      extractStreamingHtml('HTML:\n<!doctype html>\n<html><head><script src="https://cdn.x/y.js">'),
    ).toBe("");
  });

  it("strips markers, preamble, and an opening fence, and drops a half-written tag", () => {
    const raw =
      'DETAILS:\nWarm palette.\nTITLE: Home\nHTML:\n```html\n<!doctype html>\n<html><head></head><body class="bg-white"><h1>Hello</h1><p cla';

    expect(extractStreamingHtml(raw)).toBe(
      '<!doctype html>\n<html><head></head><body class="bg-white"><h1>Hello</h1>',
    );
  });

  it("drops a script still being written so its source never renders as text", () => {
    const raw =
      "<!doctype html><html><head></head><body><main>Hi</main><script>const chart = new Chart(";

    expect(extractStreamingHtml(raw)).toBe(
      "<!doctype html><html><head></head><body><main>Hi</main>",
    );
  });

  it("stops at the closing fence and ignores trailing prose", () => {
    const raw =
      "Here you go:\n```html\n<!doctype html><html><body><main>Done</main></body></html>\n```\nLet me know!";

    expect(extractStreamingHtml(raw)).toBe(
      "<!doctype html><html><body><main>Done</main></body></html>",
    );
  });
});
