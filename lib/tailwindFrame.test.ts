import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { precompileTailwind, TAILWIND_SOURCE_FILES, type TailwindSources } from "@/lib/tailwindFrame";

const sources = Object.fromEntries(
  TAILWIND_SOURCE_FILES.map((file) => [file, readFileSync(`node_modules/tailwindcss/${file}`, "utf8")]),
) as TailwindSources;

const RUNTIME = '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>';

describe("precompileTailwind", () => {
  it("swaps the runtime for CSS covering the page's classes and its own @theme", async () => {
    const html = `<html><head>${RUNTIME}<style type="text/tailwindcss">@theme { --color-brand: #123456; }</style></head><body><div class="flex bg-brand md:grid-cols-3 text-[#abcdef] font-['Inter']">x</div><script>el.classList.add("hidden")</script></body></html>`;
    const result = await precompileTailwind(html, sources);
    expect(result).not.toContain("@tailwindcss/browser");
    const css = /<style data-wirely-tailwind>([\s\S]*?)<\/style>/.exec(result)?.[1] ?? "";
    for (const selector of [".flex", ".bg-brand", ".md\\:grid-cols-3", ".hidden", "#abcdef", "Inter"]) {
      expect(css).toContain(selector);
    }
  });

  it("leaves a page without the runtime alone, and keeps a style tag from ending early", async () => {
    expect(await precompileTailwind("<p class='flex'>x</p>", sources)).toBe("<p class='flex'>x</p>");
    const html = `${RUNTIME}<p class="after:content-['</style>']">x</p>`;
    const result = await precompileTailwind(html, sources);
    // One closing tag for the compiled block, plus the one in the class itself.
    expect(result.match(/<\/style/gi)?.length).toBe((html.match(/<\/style/gi)?.length ?? 0) + 1);
  });
});
