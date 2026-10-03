import { afterEach, describe, expect, it } from "bun:test";

import { hasTailwindRuntime, precompileFrameHtml } from "@/lib/tailwindFrameBrowser";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("precompileFrameHtml", () => {
  it("compiles a live frame's page before a background preview queued earlier", async () => {
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;
    const finished: string[] = [];
    // Pages without the runtime script compile to themselves, so no stylesheet is needed.
    const preview = precompileFrameHtml("<p>preview</p>", { background: true }).then(() =>
      finished.push("preview"),
    );
    const live = precompileFrameHtml("<p>live</p>").then(() => finished.push("live"));
    await Promise.all([preview, live]);

    expect(finished).toEqual(["live", "preview"]);
  });
});

describe("hasTailwindRuntime", () => {
  it("spots the runtime script a failed compile leaves in place", () => {
    expect(
      hasTailwindRuntime(
        '<head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script></head>',
      ),
    ).toBe(true);
    expect(hasTailwindRuntime("<head><style data-wirely-tailwind>a{}</style></head>")).toBe(false);
  });
});
