import { describe, expect, it } from "bun:test";
import { buildRevealSteps, markAgentCursor } from "@/lib/agentCursor";

const doc = (body: string) =>
  `<html><head><title>T</title></head><body class="bg-white">${body}</body></html>`;

describe("markAgentCursor", () => {
  it("marks the first new element when a stream appends to the page", () => {
    const previous = doc("<header><h1>Acme</h1></header>");
    const next = doc('<header><h1>Acme</h1></header><section class="hero"><p>Hi</p></section>');

    expect(markAgentCursor(previous, next)).toEqual({
      html: doc(
        '<header><h1>Acme</h1></header><section data-wirely-cursor class="hero"><p>Hi</p></section>',
      ),
      found: true,
    });
  });

  it("marks the element that owns edited text when no tag was added", () => {
    const previous = doc("<main><p>Starting at $9</p><p>Footer</p></main>");
    const next = doc("<main><p>Starting at $12</p><p>Footer</p></main>");

    expect(markAgentCursor(previous, next).html).toBe(
      doc("<main><p data-wirely-cursor>Starting at $12</p><p>Footer</p></main>"),
    );
  });

  it("skips scripts, line breaks, and markup inside script strings", () => {
    const previous = doc("<div>A</div>");
    const next = doc('<div>A</div><script>const s = "<p>x</p>";</script><br><span>B</span>');

    expect(markAgentCursor(previous, next).html).toBe(
      doc('<div>A</div><script>const s = "<p>x</p>";</script><br><span data-wirely-cursor>B</span>'),
    );
  });

  it("finds nothing when the html is unchanged or the change sits outside the body", () => {
    const html = doc("<div>A</div>");
    expect(markAgentCursor(html, html)).toEqual({ html, found: false });

    const retitled = html.replace("<title>T</title>", "<title>New</title>");
    expect(markAgentCursor(html, retitled)).toEqual({ html: retitled, found: false });
  });

  it("marks the first element of a brand new page", () => {
    expect(markAgentCursor("", doc("<nav>Menu</nav><main>Body</main>")).html).toBe(
      doc("<nav data-wirely-cursor>Menu</nav><main>Body</main>"),
    );
  });
});

describe("buildRevealSteps", () => {
  it("builds a new page one element at a time and ends on the full page", () => {
    const next = doc("<header>A</header><main><h1>B</h1><p>C</p></main>");

    expect(buildRevealSteps("", next)).toEqual([
      '<html><head><title>T</title></head><body class="bg-white">',
      '<html><head><title>T</title></head><body class="bg-white"><header>A</header>',
      '<html><head><title>T</title></head><body class="bg-white"><header>A</header><main>',
      '<html><head><title>T</title></head><body class="bg-white"><header>A</header><main><h1>B</h1>',
      next,
    ]);
  });

  it("grows only the patched region and keeps the unchanged tail", () => {
    const previous = doc("<header>A</header><footer>Z</footer>");
    const next = doc("<header>A</header><section><p>New</p></section><footer>Z</footer>");

    expect(buildRevealSteps(previous, next)).toEqual([
      doc("<header>A</header><section><footer>Z</footer>"),
      next,
    ]);
  });

  it("samples long pages down to the step budget and skips script bodies", () => {
    const items = Array.from({ length: 40 }, (_, index) => `<li>${index}</li>`).join("");
    const next = doc(`<script>const s = "<div>";</script><ul>${items}</ul>`);
    const steps = buildRevealSteps("", next, 5);

    expect(steps).toHaveLength(5);
    expect(steps.at(-1)).toBe(next);
    expect(steps.every((step) => !step.endsWith('"<div>'))).toBe(true);
  });
});
