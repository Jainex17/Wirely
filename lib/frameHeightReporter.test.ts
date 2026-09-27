import { describe, expect, it } from "bun:test";

import { injectIframeHeightReporter } from "@/lib/frameHeightReporter";

describe("injectIframeHeightReporter", () => {
  it("injects a script that parses, before </body>", () => {
    const html = injectIframeHeightReporter("<html><body><p>x</p></body></html>", "frame-1");
    const script = /<script>([\s\S]*)<\/script><\/body>/.exec(html)?.[1];

    expect(script).toBeDefined();
    // The script is assembled from a string, so a typo only shows up as every
    // preview silently losing its height. Parsing it catches that here.
    expect(() => new Function(script!)).not.toThrow();
    expect(script).toContain('"frame-1"');
  });

  it("leaves empty html alone", () => {
    expect(injectIframeHeightReporter("", "frame-1")).toBe("");
  });
});
