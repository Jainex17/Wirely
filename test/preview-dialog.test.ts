import { describe, expect, it } from "bun:test";

import {
  MIN_PREVIEW_WIDTH,
  clampPreviewWidth,
  injectPreviewEscapeHandler,
} from "@/components/PageRenderer";

describe("dragging the preview width", () => {
  const STAGE = 1000;

  it("tracks the drag exactly within the stage", () => {
    expect(clampPreviewWidth(640, STAGE)).toBe(640);
    expect(clampPreviewWidth(999, STAGE)).toBe(999);
  });

  it("refuses to go narrower than readable", () => {
    expect(clampPreviewWidth(0, STAGE)).toBe(MIN_PREVIEW_WIDTH);
    expect(clampPreviewWidth(-500, STAGE)).toBe(MIN_PREVIEW_WIDTH);
    expect(clampPreviewWidth(MIN_PREVIEW_WIDTH - 1, STAGE)).toBe(MIN_PREVIEW_WIDTH);
  });

  it("stops at the stage edge rather than overflowing it", () => {
    // Dragging past the edge pins the width instead of hiding the frame.
    expect(clampPreviewWidth(STAGE + 400, STAGE)).toBe(STAGE);
    expect(clampPreviewWidth(99999, STAGE)).toBe(STAGE);
  });

  it("does not clamp to zero before the stage has been measured", () => {
    // First paint reports a stage width of 0; clamping to it would collapse
    // the artboard to nothing.
    expect(clampPreviewWidth(1440, 0)).toBe(1440);
    expect(clampPreviewWidth(1440, MIN_PREVIEW_WIDTH)).toBe(1440);
  });

  it("returns whole pixels, so the readout never shows a fraction", () => {
    expect(clampPreviewWidth(640.4, STAGE)).toBe(640);
    expect(clampPreviewWidth(640.6, STAGE)).toBe(641);
    expect(Number.isInteger(clampPreviewWidth(777.777, STAGE))).toBe(true);
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
