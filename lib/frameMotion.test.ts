import { describe, expect, it } from "bun:test";

import { FRAME_MOTION_REPLAY, freezeFrameMotion, injectFrameMotion } from "@/lib/frameMotion";

describe("injectFrameMotion", () => {
  it("injects a script that parses, before </body>", () => {
    const html = injectFrameMotion("<html><body><p>x</p></body></html>", "frame-1");
    const script = /<script>([\s\S]*)<\/script><\/body>/.exec(html)?.[1];

    expect(script).toBeDefined();
    // Assembled from a string, so a typo would only show up as frames that
    // play every animation again. Parsing it catches that here.
    expect(() => new Function(script!)).not.toThrow();
    expect(script).toContain('"frame-1"');
    expect(script).toContain(FRAME_MOTION_REPLAY);
  });

  it("leaves empty html alone", () => {
    expect(injectFrameMotion("", "frame-1")).toBe("");
  });
});

describe("freezeFrameMotion", () => {
  it("turns off animations in the head, or at the top when there is no head", () => {
    expect(freezeFrameMotion("<html><head></head><body></body></html>")).toMatch(
      /<style>[^<]*animation:none!important[^<]*<\/style><\/head>/,
    );
    expect(freezeFrameMotion("<p>x</p>")).toMatch(/^<style>[^<]*animation:none!important/);
  });
});
