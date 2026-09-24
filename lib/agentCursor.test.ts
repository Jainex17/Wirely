import { describe, expect, it } from "bun:test";
import { markAgentCursor } from "@/lib/agentCursor";

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
