import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import {
  collectStyleMap,
  compareStyleMaps,
  diffPixels,
  formatBuildReport,
  pairElements,
  parseStyleMap,
  type StyleMap,
  type StyleMapElement,
} from "@/lib/buildCheck";

const element = (overrides: Partial<StyleMapElement>): StyleMapElement => ({
  tag: "p",
  text: "Hello",
  x: 0,
  y: 0,
  w: 100,
  h: 20,
  color: [17, 24, 39, 255],
  background: [0, 0, 0, 0],
  fontSize: 16,
  fontWeight: 400,
  fontFamily: "inter",
  radius: 0,
  ...overrides,
});

const map = (elements: StyleMapElement[], height = 1000): StyleMap => ({
  width: 1440,
  height,
  elements,
});

describe("pairElements", () => {
  test("pairs repeated text by position, so the second card pairs with the second", () => {
    const design = map([
      element({ text: "Learn more", y: 100 }),
      element({ text: "Learn more", y: 500 }),
    ]);
    const build = map([
      element({ text: "Learn more", y: 520, fontSize: 14 }),
      element({ text: "Learn  MORE", y: 90 }),
    ]);
    const { pairs, missing, extra } = pairElements(design, build);
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    expect(pairs.map((pair) => [pair.design.y, pair.build.y])).toEqual([
      [100, 90],
      [500, 520],
    ]);
  });
});

describe("compareStyleMaps", () => {
  test("reports nothing for identical pages", () => {
    const page = map([element({ text: "Pricing" }), element({ text: "Start", y: 50 })]);
    expect(compareStyleMaps(page, page)).toEqual([]);
  });

  test("puts missing content first and lists build-only text last", () => {
    const issues = compareStyleMaps(
      map([element({ text: "Billed annually", y: 610 }), element({ text: "Pro", fontSize: 24 })]),
      map([element({ text: "Pro", fontSize: 20 }), element({ text: "Cookie banner", y: 900 })]),
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      'Missing in the build: "Billed annually" (design y=610px).',
      'Font size: 24px in the design, 20px in the build ("Pro").',
      'Only in the build: "Cookie banner" (y=900px).',
    ]);
  });

  test("reads copy reworded in the same spot as one change", () => {
    const issues = compareStyleMaps(
      map([element({ text: "Billed annually", y: 150 })]),
      map([element({ text: "Monthly plans", y: 148 })]),
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      'Different text: "Billed annually" in the design is "Monthly plans" in the build.',
    ]);
  });

  test("blames a font change for a different text box instead of reporting the size too", () => {
    const issues = compareStyleMaps(
      map([element({ text: "Hero", w: 361, h: 55, fontSize: 48 })]),
      map([element({ text: "Hero", w: 302, h: 47, fontSize: 36 })]),
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      'Font size: 48px in the design, 36px in the build ("Hero").',
    ]);
  });

  test("merges one wrong color used by many elements into a single line", () => {
    const texts = ["Features", "Docs", "Blog", "About"];
    const issues = compareStyleMaps(
      map(texts.map((text, index) => element({ text, x: index * 100, color: [107, 114, 128, 255] }))),
      map(texts.map((text, index) => element({ text, x: index * 100, color: [156, 163, 175, 255] }))),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe(
      'Text color: #6b7280 in the design, #9ca3af in the build (4 elements, e.g. "Features", "Docs", "Blog").',
    );
  });

  test("ignores color noise below what a reviewer would notice", () => {
    const issues = compareStyleMaps(
      map([element({ color: [100, 100, 100, 255] })]),
      map([element({ color: [108, 104, 100, 255] })]),
    );
    expect(issues).toEqual([]);
  });

  test("reports a different font family, weight, background, and radius", () => {
    const issues = compareStyleMaps(
      map([element({ tag: "a", text: "Start", fontWeight: 600, background: [79, 70, 229, 255], radius: 8 })]),
      map([
        element({
          tag: "a",
          text: "Start",
          fontFamily: "arial",
          fontWeight: 400,
          background: [0, 0, 0, 0],
          radius: 4,
        }),
      ]),
    ).map((issue) => issue.message);
    expect(issues).toEqual([
      'Font: the design uses "inter" and the build uses "arial" (1 element, e.g. "Start").',
      'Font weight: 600 in the design, 400 in the build ("Start").',
      'Background: #4f46e5 in the design, none in the build ("Start").',
      'Corner radius: 8px in the design, 4px in the build ("Start").',
    ]);
  });

  test("reports a clear size change but not a few pixels of wrap difference", () => {
    const small = compareStyleMaps(
      map([element({ w: 300, h: 24 })]),
      map([element({ w: 306, h: 24 })]),
    );
    expect(small).toEqual([]);
    const large = compareStyleMaps(
      map([element({ text: "Hero", w: 600, h: 120 })]),
      map([element({ text: "Hero", w: 600, h: 180 })]),
    );
    expect(large.map((issue) => issue.message)).toEqual([
      'Size: "Hero" is 600x120px in the design and 600x180px in the build.',
    ]);
  });
});

const solid = (width: number, height: number, rgb: [number, number, number]) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set([...rgb, 255], i);
  }
  return data;
};

describe("diffPixels", () => {
  test("finds the band that differs and counts extra rows as different", () => {
    const width = 10;
    const design = solid(width, 100, [255, 255, 255]);
    const build = solid(width, 120, [255, 255, 255]);
    // Rows 40 to 59 of the build are black.
    build.fill(0, 40 * width * 4, 60 * width * 4);
    for (let i = 3; i < build.length; i += 4) build[i] = 255;

    const diff = diffPixels(
      { data: design, height: 100 },
      { data: build, height: 120 },
      width,
      { bandHeight: 20 },
    );
    expect(diff.height).toBe(120);
    expect(diff.ratio).toBeCloseTo(40 / 120);
    expect(diff.regions).toEqual([
      { top: 40, bottom: 60, ratio: 1 },
      { top: 100, bottom: 120, ratio: 1 },
    ]);
    // A differing pixel is red, a matching one is faded gray.
    expect([...diff.image.slice(40 * width * 4, 40 * width * 4 + 4)]).toEqual([255, 0, 0, 255]);
    expect(diff.image[0]).toBe(255);
  });

  test("treats JPEG-sized noise as the same pixel", () => {
    const design = solid(4, 4, [120, 120, 120]);
    const build = solid(4, 4, [124, 118, 121]);
    expect(diffPixels({ data: design, height: 4 }, { data: build, height: 4 }, 4).ratio).toBe(0);
  });
});

describe("formatBuildReport", () => {
  test("names the design text inside each region", () => {
    const design = map([element({ text: "Pro plan", y: 830 })], 2140);
    const report = formatBuildReport({
      url: "http://localhost:3000/pricing",
      designTitle: "Pricing",
      design,
      build: map([], 2380),
      issues: [{ rank: 1, message: "Missing in the build: \"Pro plan\" (design y=830px)." }],
      pixels: {
        ratio: 0.184,
        regions: [{ top: 410, bottom: 620, ratio: 0.41 }],
        image: new Uint8Array(),
        width: 0,
        height: 0,
      },
      scale: 2,
    });
    expect(report).toBe(
      [
        'Build check: http://localhost:3000/pricing against "Pricing".',
        "Page height: 2140px in the design, 2380px in the build.",
        "Pixels: 18.4% of the page differs.",
        "Areas that differ most:",
        '- y 820 to 1240px, 41% differs, near "Pro plan".',
        "Differences, most important first (1):",
        '1. Missing in the build: "Pro plan" (design y=830px).',
      ].join("\n"),
    );
  });
});

describe("parseStyleMap", () => {
  test("accepts a collected map and rejects malformed input", () => {
    const valid = map([element({})]);
    expect(parseStyleMap(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    expect(parseStyleMap({ ...valid, elements: [{ ...element({}), color: [0, 0, 0] }] })).toBeNull();
    expect(parseStyleMap({ width: 1, height: 1, elements: "nope" })).toBeNull();
    expect(parseStyleMap(null)).toBeNull();
  });
});

describe("collectStyleMap", () => {
  test("measures elements with their own text and skips empty wrappers", () => {
    const dom = new JSDOM(
      "<body><div><h1 style=\"font-size:48px;font-weight:700;font-family:'Inter',sans-serif\">Hi  there</h1><div></div></div></body>",
      { pretendToBeVisual: true },
    );
    const globals = globalThis as Record<string, unknown>;
    const saved = ["window", "document", "Node", "getComputedStyle"].map((key) => [key, globals[key]] as const);
    Object.assign(globals, {
      window: dom.window,
      document: dom.window.document,
      Node: dom.window.Node,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    });
    // jsdom has no canvas or layout, so colors read as transparent and the heading gets a box.
    dom.window.HTMLCanvasElement.prototype.getContext = () => null;
    dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
      return { left: 10, top: 20, width: 200, height: 56, right: 210, bottom: 76, x: 10, y: 20, toJSON: () => ({}) };
    };
    try {
      const result = collectStyleMap();
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]).toMatchObject({
        tag: "h1",
        text: "Hi there",
        x: 10,
        y: 20,
        w: 200,
        h: 56,
        fontSize: 48,
        fontWeight: 700,
        fontFamily: "inter",
      });
    } finally {
      for (const [key, value] of saved) globals[key] = value;
    }
  });
});
