import { describe, expect, it } from "bun:test";

import {
  buildVisualLintReport,
  composite,
  contrastRatio,
  describeWrite,
  resolveBackground,
  type ContrastCandidate,
  type Rgba,
} from "@/lib/mcp/diagnostics";

const BLACK: Rgba = [0, 0, 0, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const GRAY_77: Rgba = [119, 119, 119, 255];

describe("describeWrite", () => {
  const page = (body: string) => `<html><body>${body}</body></html>`;

  it("says nothing when the page was stored as sent", () => {
    const html = page("<main><style>.a{}</style><h1 style=\"color:red\">Hi</h1></main>");
    expect(describeWrite(html, html)).toBe("");
  });

  it("names what the sanitizer removed", () => {
    expect(
      describeWrite(
        page('<button>Save</button><button>Undo</button><form></form><script src="https://x.test/a.js"></script>'),
        page(""),
      ),
    ).toStartWith("The sanitizer removed 1 <form>, 2 <button>, 1 <script> with their contents.");
  });

  it("flags a page that will not render", () => {
    expect(describeWrite("<div>Hi</div>", "<div>Hi</div>")).toBe(
      "Not renderable: the page needs complete <html> and <body> tags.",
    );
  });
});

describe("contrast math", () => {
  it("matches the WCAG endpoints and a known mid pair", () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    expect(contrastRatio(GRAY_77, WHITE).toFixed(2)).toBe("4.48");
    expect(contrastRatio(WHITE, GRAY_77).toFixed(2)).toBe("4.48");
  });

  it("composites a translucent color over an opaque one", () => {
    expect(composite([0, 0, 0, 128], WHITE)).toEqual([127, 127, 127, 255]);
    expect(composite([0, 0, 0, 0], WHITE)).toEqual(WHITE);
  });
});

describe("resolveBackground", () => {
  it("stops at the first opaque layer and composites translucent ones over it", () => {
    expect(
      resolveBackground([
        { color: [0, 0, 0, 0], hasImage: false },
        { color: [0, 0, 0, 128], hasImage: false },
        { color: WHITE, hasImage: false },
        { color: [255, 0, 0, 255], hasImage: false },
      ]),
    ).toEqual([127, 127, 127, 255]);
  });

  it("falls back to white when nothing is opaque", () => {
    expect(resolveBackground([{ color: [0, 0, 0, 0], hasImage: false }])).toEqual(WHITE);
  });

  it("gives up when a background image sits above the first opaque color", () => {
    expect(
      resolveBackground([
        { color: [0, 0, 0, 0], hasImage: true },
        { color: WHITE, hasImage: false },
      ]),
    ).toBeNull();
  });

  it("ignores a background image below the first opaque color", () => {
    expect(
      resolveBackground([
        { color: BLACK, hasImage: false },
        { color: WHITE, hasImage: true },
      ]),
    ).toEqual(BLACK);
  });
});

describe("buildVisualLintReport", () => {
  const candidate = (label: string, text: Rgba, fontSizePx = 16, fontWeight = 400): ContrastCandidate => ({
    label,
    text,
    layers: [{ color: WHITE, hasImage: false }],
    fontSizePx,
    fontWeight,
  });
  const clean = { scrollWidth: 1280, viewportWidth: 1280, overflowing: [], clipped: [], contrast: [] };

  it("says so in one line when nothing is wrong", () => {
    expect(buildVisualLintReport({ ...clean, contrast: [candidate('p "Fine"', BLACK)] })).toBe(
      "Visual lint: no overflow, clipped text, or low contrast found.",
    );
  });

  it("reports overflow, clipping, and contrast with the right threshold", () => {
    expect(
      buildVisualLintReport({
        scrollWidth: 1600,
        viewportWidth: 1280,
        overflowing: ['div.w-[1600px] "Wide"'],
        clipped: ['h3.h-4.overflow-hidden "Tall title"'],
        contrast: [
          candidate('p.text-slate-400 "Starting at $9 per month"', [170, 170, 170, 255]),
          // 4.48:1 fails body text but passes large bold text.
          candidate('h2 "Big"', GRAY_77, 20, 700),
          candidate('p "Faded"', [0, 0, 0, 64]),
        ],
      }),
    ).toBe(
      [
        "Visual lint:",
        "Page scrolls sideways: content is 1600px wide in a 1280px viewport.",
        'Wider than the viewport: div.w-[1600px] "Wide"',
        'Clipped text in h3.h-4.overflow-hidden "Tall title"',
        'Low contrast 2.3:1 (needs 4.5) on p.text-slate-400 "Starting at $9 per month"',
        'Low contrast 1.8:1 (needs 4.5) on p "Faded"',
      ].join("\n"),
    );
  });

  it("skips text over a background image", () => {
    expect(
      buildVisualLintReport({
        ...clean,
        contrast: [{ ...candidate('p "Hero"', WHITE), layers: [{ color: WHITE, hasImage: true }] }],
      }),
    ).toBe("Visual lint: no overflow, clipped text, or low contrast found.");
  });

  it("dedupes identical findings and caps the list", () => {
    const repeated = Array.from({ length: 3 }, () => candidate('p "Same"', WHITE));
    const distinct = Array.from({ length: 20 }, (_, i) => `div "Row ${i}"`);
    const report = buildVisualLintReport({ ...clean, overflowing: distinct, contrast: repeated });
    const lines = report.split("\n");

    expect(lines).toHaveLength(17);
    expect(lines[1]).toBe('Wider than the viewport: div "Row 0"');
    expect(lines[15]).toBe('Wider than the viewport: div "Row 14"');
    expect(lines[16]).toBe("And 6 more.");
  });
});
