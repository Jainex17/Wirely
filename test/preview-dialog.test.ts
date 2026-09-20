import { describe, expect, it } from "bun:test";

import { PREVIEW_WIDTHS, injectPreviewEscapeHandler } from "@/components/PageRenderer";

describe("preview width choices", () => {
  it("spans phone to desktop so responsive output can be checked", () => {
    const widths = PREVIEW_WIDTHS.map((size) => size.width);

    expect(Math.min(...widths)).toBeLessThanOrEqual(375);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(1440);
    // A desktop concept has to be readable at phone width, which is the point.
    expect(widths).toContain(375);
  });

  it("offers each width once, in ascending order", () => {
    const widths = PREVIEW_WIDTHS.map((size) => size.width);

    expect(new Set(widths).size).toBe(widths.length);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
  });

  it("labels every width for a tooltip", () => {
    for (const size of PREVIEW_WIDTHS) {
      expect(size.name.length).toBeGreaterThan(0);
      expect(size.label).toBe(String(size.width) as typeof size.label);
    }
  });
});

describe("closing the preview from inside the frame", () => {
  const reporterId = "wirely-height-abc-123";

  it("forwards Escape out of the frame, which otherwise swallows it", () => {
    const html = injectPreviewEscapeHandler(
      "<!doctype html><html><body><h1>Hi</h1></body></html>",
      reporterId,
    );

    expect(html).toContain('event.key==="Escape"');
    expect(html).toContain("window.parent.postMessage");
    expect(html).toContain('"wirely-preview-escape"');
    // Tagged, so one frame's Escape cannot close another page's preview.
    expect(html).toContain(JSON.stringify(reporterId));
  });

  it("puts the handler inside the document, not after it", () => {
    const html = injectPreviewEscapeHandler(
      "<!doctype html><html><body><h1>Hi</h1></body></html>",
      reporterId,
    );

    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("</body>"));
    expect(html.endsWith("</html>")).toBe(true);
  });

  it("still returns a usable document when there is no body tag", () => {
    const html = injectPreviewEscapeHandler("<h1>fragment</h1>", reporterId);

    expect(html).toContain("<h1>fragment</h1>");
    expect(html).toContain("wirely-preview-escape");
  });

  it("leaves empty html alone rather than shipping a bare script", () => {
    expect(injectPreviewEscapeHandler("", reporterId)).toBe("");
  });
});
