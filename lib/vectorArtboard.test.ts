import { describe, expect, it } from "bun:test";
import {
  appendToArtboard,
  exportArtboardSvg,
  getArtboardMatrix,
  isSvgDocument,
  prepareArtboardHtml,
  readArtboardSize,
} from "@/lib/vectorArtboard";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { stampNodeIds } from "@/lib/pageNodes";

const ICON = '<?xml version="1.0"?><svg viewBox="0 0 24 24" width="480"><g><path d="M0 0L1 1"/></g></svg>';

describe("vector artboards", () => {
  it("recognizes an SVG file but not an HTML page with an inline icon", () => {
    expect(isSvgDocument(ICON)).toBe(true);
    expect(isSvgDocument("<!doctype html><body><svg></svg></body>")).toBe(false);
  });

  it("marks the artboard once and sizes the frame from it", () => {
    const prepared = prepareArtboardHtml(ICON);
    expect(prepared).not.toContain("<?xml");
    expect(prepareArtboardHtml(prepared)).toBe(prepared);
    // Width set, height from the viewBox aspect ratio.
    expect(readArtboardSize(prepared)).toEqual({ width: 480, height: 480 });
    expect(readArtboardSize(prepareArtboardHtml('<svg width="1200" height="630"></svg>'))).toEqual({
      width: 1200,
      height: 630,
    });
    expect(readArtboardSize(prepareArtboardHtml('<svg viewBox="0 0 300 100" width="100%"></svg>'))).toEqual({
      width: 300,
      height: 100,
    });
  });

  it("stamps the artboard's paths so the pen can edit them, but not an icon's inside a page", () => {
    const stamped = stampNodeIds(sanitizeIframeHtml(prepareArtboardHtml(ICON)));
    expect(stamped).toMatch(/<path data-wirely-id="[a-z0-9]+"/);
    expect(stampNodeIds('<body><svg><path d="M0 0"/></svg></body>')).not.toContain("<path data-wirely-id");
  });

  it("maps viewBox units to frame px, centering a letterboxed viewBox", () => {
    expect(getArtboardMatrix(prepareArtboardHtml(ICON))).toEqual([20, 0, 0, 20, 0, 0]);
    expect(
      getArtboardMatrix(prepareArtboardHtml('<svg viewBox="10 0 100 50" width="200" height="200"></svg>')),
    ).toEqual([2, 0, 0, 2, -20, 50]);
  });

  it("appends into the outer artboard past a nested svg and exports a clean file", () => {
    const html = prepareArtboardHtml('<svg width="10" height="10"><svg><rect/></svg></svg>');
    const appended = appendToArtboard(stampNodeIds(html), '<path d="M0 0"/>') ?? "";
    expect(appended).toContain('</svg><path d="M0 0"/></svg>');
    const svg = exportArtboardSvg(appended) ?? "";
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="10"')).toBe(true);
    expect(svg).not.toContain("data-wirely");
    expect(svg.endsWith("</svg>")).toBe(true);
  });
});
