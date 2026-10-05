import { describe, expect, it } from "bun:test";
import { gridColumns, pickDeclarations, serializeDeclarations, type StyleRead } from "@/lib/nodeFreeze";

const style =
  (values: Record<string, string>, fallback: Record<string, string> = {}): StyleRead =>
  (property) =>
    values[property] ?? fallback[property] ?? "";

// What a plain <div> computes to with no page CSS, which is mostly initial values.
const defaults = {
  color: "rgb(0, 0, 0)",
  "font-family": "serif",
  "font-size": "16px",
  "font-weight": "400",
  display: "block",
  "margin-top": "0px",
  "padding-top": "0px",
  "background-color": "rgba(0, 0, 0, 0)",
  "border-top-width": "0px",
  "border-top-style": "none",
  "border-top-color": "rgb(0, 0, 0)",
  "outline-style": "none",
  "text-decoration-line": "none",
  "letter-spacing": "normal",
  "text-transform": "none",
  transform: "none",
};

const pick = (
  own: Record<string, string>,
  {
    parent = defaults,
    plain = defaults,
    plainParent = defaults,
    initial = { ...defaults, display: "inline" },
    isRoot = false,
  }: {
    parent?: Record<string, string> | null;
    plain?: Record<string, string>;
    plainParent?: Record<string, string>;
    initial?: Record<string, string>;
    isRoot?: boolean;
  } = {},
) =>
  pickDeclarations({
    own: style(own, defaults),
    parent: parent ? style(parent, defaults) : null,
    plain: style(plain, defaults),
    plainParent: style(plainParent, defaults),
    initial: style(initial, defaults),
    isRoot,
  });

describe("pickDeclarations", () => {
  it("keeps what the page's CSS changed and drops browser defaults", () => {
    const declarations = pick({ "background-color": "rgb(255, 0, 0)", "padding-top": "24px" });
    expect(declarations).toMatchObject({ "background-color": "rgb(255, 0, 0)", "padding-top": "24px" });
    expect(declarations).not.toHaveProperty("margin-top");
    expect(declarations).not.toHaveProperty("color");
  });

  it("repeats every inherited property on the moved element, since its new parent passes down others", () => {
    const declarations = pick({}, { isRoot: true });
    expect(declarations).toMatchObject({ color: "rgb(0, 0, 0)", "font-family": "serif", "font-size": "16px" });
  });

  it("repeats on the moved element only the inherited properties a page sets, or ones it changed", () => {
    const declarations = pick({ "letter-spacing": "normal", "text-transform": "uppercase" }, { isRoot: true });
    expect(declarations).toHaveProperty("text-transform", "uppercase");
    expect(declarations).not.toHaveProperty("letter-spacing");
  });

  it("leaves out values that compute but change nothing", () => {
    const declarations = pick({
      display: "block",
      "-webkit-text-fill-color": "rgb(0, 0, 0)",
      "transform-origin": "10px 10px",
      "min-width": "auto",
    });
    expect(Object.keys(declarations)).toEqual([]);
  });

  it("repeats an inherited property inside the element only where it differs from its parent", () => {
    const parent = { ...defaults, color: "rgb(20, 20, 20)" };
    expect(pick({ color: "rgb(20, 20, 20)" }, { parent })).not.toHaveProperty("color");
    expect(pick({ color: "rgb(200, 0, 0)" }, { parent })).toHaveProperty("color", "rgb(200, 0, 0)");
  });

  it("pins what the browser's stylesheet sets on a tag, so another page's reset cannot change it", () => {
    // An <h1> the source page left at the browser's 32px, and a <p> whose
    // margin the source page reset to 0.
    const h1 = pick(
      { "font-size": "32px", "font-weight": "700" },
      { parent: { ...defaults, "font-size": "32px", "font-weight": "700" }, plain: { ...defaults, "font-size": "32px" } },
    );
    expect(h1).toHaveProperty("font-size", "32px");
    const p = pick({ "margin-top": "0px" }, { plain: { ...defaults, "margin-top": "16px" } });
    expect(p).toHaveProperty("margin-top", "0px");
  });

  it("keeps a value that matches the tag's default but not the initial value, against a page that resets it", () => {
    const p = pick({ "margin-top": "16px" }, { plain: { ...defaults, "margin-top": "16px" } });
    expect(p).toHaveProperty("margin-top", "16px");
  });

  it("drops the color and style of a border that is not drawn", () => {
    const declarations = pick({ "border-top-color": "rgb(255, 255, 255)", "border-top-style": "solid", "border-top-width": "0px" });
    expect(declarations).not.toHaveProperty("border-top-color");
    expect(declarations).not.toHaveProperty("border-top-style");
  });
});

describe("gridColumns", () => {
  it("turns equal tracks that fill the grid back into equal fractions", () => {
    expect(gridColumns("300px 300px 300px", 948, 24)).toBe("repeat(3, minmax(0, 1fr))");
  });

  it("keeps uneven or partial tracks in px", () => {
    expect(gridColumns("200px 700px", 924, 24)).toBe("200px 700px");
    expect(gridColumns("200px 200px", 900, 0)).toBe("200px 200px");
    expect(gridColumns("subgrid", 900, 0)).toBe("subgrid");
  });
});

describe("serializeDeclarations", () => {
  it("writes an inline style attribute value", () => {
    expect(serializeDeclarations({ color: "red", "font-family": '"Inter", sans-serif' })).toBe(
      'color: red; font-family: "Inter", sans-serif',
    );
  });
});
