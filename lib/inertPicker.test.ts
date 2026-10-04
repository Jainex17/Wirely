import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { applyInertPreview, offsetMatrix } from "@/lib/inertPicker";

const desktop = { width: 1440, height: 900 };

describe("applyInertPreview", () => {
  it("holds inspector values to the inert CSS rules, so a preview cannot load anything", () => {
    const element = new JSDOM("<p>x</p>").window.document.querySelector("p")!;
    applyInertPreview(
      element,
      {
        text: "Hello",
        color: "#ff0000",
        style: { "background-image": "url(https://evil.example.com/x.png)" } as never,
      },
      desktop,
    );
    expect(element.textContent).toBe("Hello");
    expect(element.getAttribute("style")).not.toContain("evil.example.com");
    expect(element.style.color).toBe("rgb(255, 0, 0)");
  });
});

describe("offsetMatrix", () => {
  it("places an SVG's own matrix at its root's position in the page, independent of zoom", () => {
    // A viewBox at half scale, for an SVG root 100px right and 40px down the page.
    expect(offsetMatrix([0.5, 0, 0, 0.5, 10, 20], 100, 40)).toEqual([0.5, 0, 0, 0.5, 110, 60]);
  });
});
