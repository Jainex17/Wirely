import { describe, expect, it } from "bun:test";
import {
  hasPageMotion,
  inertBaseCss,
  inertCustomPropertyResets,
  sanitizeInertCss,
  sanitizeInertDeclarations,
} from "@/lib/inertCss";

const desktop = { width: 1440, height: 900 };
const css = (input: string) => sanitizeInertCss(input, desktop);

describe("sanitizeInertCss", () => {
  it("drops url() to a host outside the image allowlist, however it is spelled", () => {
    const payloads = [
      ".a{background:url(https://evil.example.com/x.png)}",
      ".a{background:url('https://evil.example.com/x.png')}",
      ".a{background:URL( \"https://evil.example.com/x.png\" )}",
      ".a{background:u\\72l(https://evil.example.com/x.png)}",
      ".a{background:\\75 rl(https://evil.example.com/x.png)}",
      ".a{background:\\u\\r\\l(https://evil.example.com/x.png)}",
      ".a{background:url(https://evil.example.com/x.png",
      ".a{background:url(https://evil.example.com/a b)}",
      ".a{background:url(//evil.example.com/x.png)}",
      ".a{background:url(https://images.unsplash.com@evil.example.com/x.png)}",
      ".a{background:url(javascript:alert(1))}",
      ".a{background:url(data:text/html,<script>alert(1)</script>)}",
    ];
    for (const payload of payloads) {
      const output = css(payload);
      expect(output).not.toMatch(/evil\.example|javascript|text\/html/);
      expect(output).toContain(" none ");
    }
  });

  it("drops the functions that read a bare string as a URL", () => {
    expect(css('.a{background-image:image-set("https://evil.example.com/a.png" 1x)}')).toBe(
      ".a{background-image: none }",
    );
    expect(css('.a{background-image:-webkit-image-set("https://evil.example.com/a.png" 1x)}')).toBe(
      ".a{background-image: none }",
    );
    expect(css(".a{width:expression(alert(1))}")).toBe(".a{width: none }");
    expect(css(".a{background:-moz-element(#editor)}")).toBe(".a{background: none }");
  });

  it("keeps allowlisted images and in-page references, re-emitted from the decoded value", () => {
    expect(css(".a{background:url(https://images.unsplash.com/photo-1)}")).toBe(
      '.a{background: url("https://images.unsplash.com/photo-1") }',
    );
    expect(css(".a{background:url(/api/assets/0f8fad5b-d9cb-469f-a165-70867728950e)}")).toBe(
      '.a{background: url("/api/assets/0f8fad5b-d9cb-469f-a165-70867728950e") }',
    );
    expect(css(".a{fill:url(#grad)}")).toBe('.a{fill: url("#grad") }');
    expect(css(".a{background:url(data:image/png;base64,AAAA)}")).toBe(
      '.a{background: url("data:image/png;base64,AAAA") }',
    );
  });

  it("leaves url-looking text inside a string alone, since a string loads nothing there", () => {
    expect(css('.a::before{content:"url(https://evil.example.com)"}')).toBe(
      '.a::before{content:"url(https://evil.example.com)"}',
    );
  });

  it("drops @import, @font-face, @namespace, and @scope by renaming them", () => {
    expect(css('@import "https://evil.example.com/x.css";.a{color:red}')).toBe(
      '@wirely-dropped "https://evil.example.com/x.css";.a{color:red}',
    );
    expect(css("@\\69mport url(https://evil.example.com/x.css);")).toBe("@wirely-dropped  none ;");
    expect(css('@namespace svg "http://www.w3.org/2000/svg";')).toBe(
      '@wirely-dropped svg "http://www.w3.org/2000/svg";',
    );
    expect(css("@font-face{font-family:x;src:url(https://evil.example.com/f.woff2)}")).toBe(
      "@wirely-dropped{font-family:x;src: none }",
    );
    expect(css("@scope{:scope{position:fixed!important}}")).toBe(
      "@wirely-dropped{[data-wirely-html]{position:fixed!important}}",
    );
  });

  it("turns @property rules into default values, since a shadow root ignores registrations", () => {
    expect(
      css(
        "@property --tw-shadow{syntax:'*';inherits:false;initial-value:0 0 #0000}" +
          "@property --canvas-inverse-zoom{syntax:'<color>';inherits:true;initial-value:red}" +
          "@property --tw-font-weight{syntax:'*';inherits:false}" +
          "@property --tw-bg{syntax:'*';inherits:false;initial-value:url(https://evil.example.com/x.png)}" +
          ".a{color:red}",
      ),
    ).toBe(
      ".a{color:red}@layer wirely-ua{*,::before,::after,::backdrop{--tw-shadow:0 0 #0000;--tw-bg: none }" +
        ":where([data-wirely-html]){--canvas-inverse-zoom:red}}",
    );
  });

  it("points :host, :root, and :scope at the page root, so no rule can restyle the frame", () => {
    expect(css(":root,:host{--color-red:red}")).toBe("[data-wirely-html],[data-wirely-html]{--color-red:red}");
    expect(css(":host{position:fixed!important;inset:0!important;z-index:2147483647!important}")).toBe(
      "[data-wirely-html]{position:fixed!important;inset:0!important;z-index:2147483647!important}",
    );
    expect(css(":host(.dark) .a{color:red}")).toBe("[data-wirely-html]:is(.dark) .a{color:red}");
    expect(css(":host-context(body){color:red}")).toBe("[data-wirely-html]:is(body){color:red}");
    expect(css(":\\68ost{color:red}")).toBe("[data-wirely-html]{color:red}");
    expect(css(":HOST{color:red}")).toBe("[data-wirely-html]{color:red}");
    // A browser drops the comment and reads :host. A space makes it no pseudo-class.
    expect(css(".a{view-transition-name: root}")).toBe(".a{view-transition-name: root}");
    expect(css(":/**/host{pointer-events:auto!important}")).toBe("[data-wirely-html]{pointer-events:auto!important}");
    expect(css(":/* a */host(.x){color:red}")).toBe("[data-wirely-html]:is(.x){color:red}");
    // A comment between two compound selectors stays, or .a.b would become .a .b.
    expect(css(".a/**/.b{color:red}")).toBe(".a/**/.b{color:red}");
  });

  it("maps html and body selectors to the page's wrapper elements", () => {
    expect(css("html,body{margin:0}body .a,html.dark>body{color:red}")).toBe(
      "[data-wirely-html],[data-wirely-body]{margin:0}[data-wirely-body] .a,[data-wirely-html].dark>[data-wirely-body]{color:red}",
    );
    // A class, an attribute, and a grid area that happen to share the name.
    expect(css(".body,[html]{grid-area:body}")).toBe(".body,[html]{grid-area:body}");
  });

  it("turns width media queries into container queries on the page frame", () => {
    expect(css("@media (width >= 48rem){.md\\:flex{display:flex}}")).toBe(
      "@container wirely-page (width >= 768px) {.md\\:flex{display:flex}}",
    );
    expect(css("@media only screen and (max-width: 600px), (min-width: 1200px) and (max-width: 1400px){.a{color:red}}")).toBe(
      "@container wirely-page (max-width: 600px) or ((min-width: 1200px) and (max-width: 1400px)) {.a{color:red}}",
    );
    expect(css("@media (prefers-color-scheme: dark){.a{color:red}}")).toBe(
      "@media (prefers-color-scheme: dark){.a{color:red}}",
    );
    expect(css("@media print{.a{color:red}}")).toBe("@media print{.a{color:red}}");
  });

  it("turns viewport units into pixels of the device frame", () => {
    expect(css(".a{height:100vh;min-height:50dvh;width:calc(50vw - 1px)}")).toBe(
      ".a{height:900px;min-height:450px;width:calc(720px - 1px)}",
    );
    expect(sanitizeInertCss(".a{height:100vh}", { width: 375, height: 812 })).toBe(".a{height:812px}");
  });

  it("keeps ordinary Tailwind output unchanged", () => {
    const tailwind =
      "@layer theme{:root,:host{--font-sans:ui-sans-serif}}@layer utilities{.bg-\\[\\#111\\]{background-color:#111}.hover\\:underline{&:hover{@media (hover:hover){text-decoration-line:underline}}}}@keyframes spin{to{transform:rotate(360deg)}}";
    expect(css(tailwind)).toBe(
      "@layer theme{[data-wirely-html],[data-wirely-html]{--font-sans:ui-sans-serif}}@layer utilities{.bg-\\[\\#111\\]{background-color:#111}.hover\\:underline{&:hover{@media (hover:hover){text-decoration-line:underline}}}}@keyframes spin{to{transform:rotate(360deg)}}",
    );
  });
});

describe("escaped names", () => {
  it("drops an @property whose decoded name or value would break out of its declaration", () => {
    // Every character a name cannot hold is escaped, so the tokenizer reads one
    // ident that decodes to `--x;background-image:url(https://evil.example/pixel);--safe`.
    const escape = (value: string) =>
      value.replace(/[^a-zA-Z0-9-]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `);
    const name = escape("--x;background-image:url(https://evil.example/pixel);--safe");
    const output = css(`@property ${name}{syntax:'*';inherits:false;initial-value:0}.a{color:red}`);
    // The rule is renamed, so the browser drops it, and no declaration is made from the name.
    expect(output.startsWith("@wirely-dropped ")).toBe(true);
    expect(output).not.toContain("@layer");
    expect(output).not.toContain("url(");
    expect(css("@property --a{syntax:'*';inherits:false;initial-value:\"abc\n}.a{color:red}")).not.toContain("--a:");
    expect(css("@property --a{syntax:'*';inherits:false;initial-value:1px}")).toBe(
      "@layer wirely-ua{*,::before,::after,::backdrop{--a:1px}:where([data-wirely-html]){}}",
    );
  });

  it("resets only custom property names that read back unchanged", () => {
    const names = new Set<string>();
    sanitizeInertCss(".a{color:var(--ok);--x\\3b color\\3a red:1px}", desktop, names);
    expect(inertCustomPropertyResets(names)).toBe("@layer wirely-ua{:where([data-wirely-html]){--ok:initial}}");
  });
});

describe("page root font size", () => {
  it("reads rem from the page's root font size, and media query em and rem as 16px", () => {
    expect(css(".a{padding:1.5rem}")).toBe(".a{padding:24px}");
    expect(sanitizeInertCss(":root{--spacing:0.25rem}", { ...desktop, rootFontSize: 10 })).toBe(
      "[data-wirely-html]{--spacing:2.5px}",
    );
    expect(css("@media (min-width: 40em) and (max-width: 64rem){.a{color:red}}")).toBe(
      "@container wirely-page (min-width: 640px) and (max-width: 1024px) {.a{color:red}}",
    );
  });
});

describe("inertCustomPropertyResets", () => {
  it("resets every custom property the page names, so editor variables never leak in", () => {
    const names = new Set<string>();
    sanitizeInertCss(".a{color:var(--primary, red);--spacing:4px}", desktop, names);
    sanitizeInertDeclarations("background:var(--background)", desktop, names);
    expect(inertCustomPropertyResets(names)).toBe(
      "@layer wirely-ua{:where([data-wirely-html]){--primary:initial;--spacing:initial;--background:initial}}",
    );
  });
});

describe("hasPageMotion", () => {
  it("is true only when an animation references the page's keyframes", () => {
    expect(hasPageMotion("<style>@keyframes fade{to{opacity:1}}.a{animation:fade 1s}</style>")).toBe(true);
    expect(hasPageMotion("<style>:root{--animate-spin:spin 1s linear infinite}@keyframes spin{to{rotate:1turn}}</style>")).toBe(true);
    expect(hasPageMotion("<style>@keyframes fade{to{opacity:1}}.a{color:red}</style>")).toBe(false);
    expect(hasPageMotion("<style>@keyframes fade{to{opacity:1}}.fade{color:red}</style>")).toBe(false);
    expect(hasPageMotion('<style>@keyframes fade{to{opacity:1}}</style><p style="animation: fade 1s">x</p>')).toBe(true);
    expect(hasPageMotion('<style type="text/tailwindcss">@keyframes x{} .a{animation:x}</style>')).toBe(false);
  });
});

describe("sanitizeInertDeclarations", () => {
  it("drops !important from inline motion, so the settled motion rule always wins", () => {
    expect(sanitizeInertDeclarations("animation:spin 1s infinite !important;color:red!important", desktop)).toBe(
      "animation:spin 1s infinite ;color:red!important",
    );
    expect(sanitizeInertDeclarations("transition-duration:2s!/**/important", desktop)).toBe("transition-duration:2s");
  });

  it("drops a style attribute's exfiltrating background and keeps the rest", () => {
    expect(
      sanitizeInertDeclarations(
        "color:red;background-image:url(https://evil.example.com/pixel.gif);height:100vh",
        desktop,
      ),
    ).toBe("color:red;background-image: none ;height:900px");
  });
});

describe("inertBaseCss", () => {
  it("floors the page at the device height", () => {
    expect(inertBaseCss({ width: 375, height: 812 })).toContain(
      ":where([data-wirely-html]){display:block;min-height:812px}",
    );
  });
});
