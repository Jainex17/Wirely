import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { stripWirelyArtifacts } from "@/lib/agentPrompt";
import { stampNodeIds } from "@/lib/pageNodes";
import {
  addPlayScript,
  findNavigationMismatches,
  PAGE_LINK_ATTRIBUTE,
  parseFlowInput,
  PLAY_GOTO_MESSAGE,
  PLAY_KEY_MESSAGE,
  readPageLinks,
  setPageLink,
} from "@/lib/prototypeFlow";

const read = (path: string) => readFileSync(path, "utf8");

describe("prototype flow wiring", () => {
  it("validates ownership and membership when saving the flow", () => {
    const source = read("app/api/projects/[projectId]/prototype/route.ts");

    expect(source.includes("getRequestSessionUser")).toBe(true);
    expect(source.includes("readJsonBodyWithLimit")).toBe(true);
    expect(source.includes("parseFlowInput")).toBe(true);
    expect(source.includes("upsertPrototypeFlowForProject")).toBe(true);
    expect(source.includes("getPrototypeFlowForProject")).toBe(true);
  });

  it("saves the flow from the dialog and opens the prototype route", () => {
    const source = read("components/PrototypeFlowDialog.tsx");

    expect(source.includes("`/api/projects/${wireId}/prototype`")).toBe(true);
    expect(source.includes("method: \"PUT\"")).toBe(true);
    expect(source.includes("startPageId: flowStartId")).toBe(true);
    expect(source.includes("`/wire/${wireId}/prototype`")).toBe(true);
  });

  it("loads the persisted flow server-side with device types", () => {
    const source = read("app/wire/[id]/prototype/page.tsx");

    expect(source.includes("getPrototypeFlowForProject")).toBe(true);
    expect(source.includes("getProjectPlaybackForUser")).toBe(true);
    expect(source.includes("getServerSessionUser")).toBe(true);
    expect(source.includes("initialPageIndex")).toBe(true);
  });

  it("renders the viewer with flow navigation and device switching", () => {
    const source = read("components/PrototypeViewer.tsx");

    expect(source.includes('deviceOverride ?? currentPage.deviceType')).toBe(true);
    expect(source.includes("ArrowRight")).toBe(true);
    expect(source.includes("ArrowLeft")).toBe(true);
    expect(source.includes("sanitizeIframeHtml")).toBe(true);
    expect(source.includes("DEVICE_WIDTHS")).toBe(true);
  });

  it("opens the play view from the editor", () => {
    const source = read("components/ProjectChrome.tsx");

    expect(source.includes("href={`/wire/${projectId}/prototype`}")).toBe(true);
  });
});

describe("parseFlowInput", () => {
  it("accepts an ordered list and a start screen inside it", () => {
    expect(parseFlowInput(["a", "b"], "b")).toEqual({ ok: true, pageIds: ["a", "b"], startPageId: "b" });
    expect(parseFlowInput(["a"], undefined)).toEqual({ ok: true, pageIds: ["a"], startPageId: null });
  });

  it("rejects an empty list, repeats, and a start screen outside the list", () => {
    expect(parseFlowInput([], null).ok).toBe(false);
    expect(parseFlowInput(["a", "a"], null)).toEqual({ ok: false, error: "pageIds must not contain duplicates." });
    expect(parseFlowInput(["a"], "b")).toEqual({ ok: false, error: "startPageId must be one of pageIds." });
  });
});

describe("findNavigationMismatches", () => {
  const nav = (...labels: string[]) =>
    `<html><body><nav>${labels.map((label) => `<a href="#">${label}</a>`).join("")}</nav></body></html>`;

  it("reports the screen whose nav differs from the rest", () => {
    const lines = findNavigationMismatches([
      { title: "Home", deviceType: "desktop", html: nav("Home", "Pricing", "Docs") },
      { title: "Pricing", deviceType: "desktop", html: nav("Home", "Pricing", "Docs") },
      { title: "Docs", deviceType: "desktop", html: nav("Home", "Docs") },
    ]);
    expect(lines).toEqual([
      '"Docs" (desktop) has Home, Docs; 2 other screens use Home, Pricing, Docs.',
    ]);
  });

  it("reads a header when there is no nav and flags a screen without either", () => {
    const lines = findNavigationMismatches([
      { title: "A", deviceType: "desktop", html: '<header><a href="#"><span>Shop</span> &amp; more</a></header>' },
      { title: "B", deviceType: "desktop", html: '<header><a href="#">Shop &amp; more</a></header>' },
      { title: "C", deviceType: "desktop", html: "<main>No nav</main>" },
    ]);
    expect(lines).toEqual(['"C" (desktop) has no <nav> or <header>; 2 other screens use Shop & more.']);
  });

  it("compares desktop and mobile apart and ignores artboards", () => {
    expect(
      findNavigationMismatches([
        { title: "Desktop", deviceType: "desktop", html: nav("Home", "Pricing") },
        { title: "Mobile", deviceType: "mobile", html: nav("Menu") },
        { title: "Logo", deviceType: "vector", html: "<svg></svg>" },
      ]),
    ).toEqual([]);
  });
});

describe("page links", () => {
  const html =
    '<html><body><nav data-wirely-id="n1"><a href="#" data-wirely-id="a1">Pricing</a>' +
    '<a href="#" data-wirely-id="a2">Docs</a></nav></body></html>';

  it("links an element to a page and reads the link back with its text", () => {
    const linked = setPageLink(html, "a1", "page-2") ?? "";
    expect(linked).toContain(`<a href="#" data-wirely-id="a1" ${PAGE_LINK_ATTRIBUTE}="page-2">`);
    expect(readPageLinks(linked)).toEqual([{ nodeId: "a1", targetPageId: "page-2", label: "Pricing" }]);
  });

  it("retargets an existing link instead of adding a second one", () => {
    const linked = setPageLink(setPageLink(html, "a1", "page-2") ?? "", "a1", "page-3") ?? "";
    expect(readPageLinks(linked)).toEqual([{ nodeId: "a1", targetPageId: "page-3", label: "Pricing" }]);
  });

  it("removes a link with a null target, leaving the element as it was", () => {
    const linked = setPageLink(html, "a2", "page-2") ?? "";
    expect(setPageLink(linked, "a2", null)).toBe(html);
    expect(readPageLinks(html)).toEqual([]);
  });

  it("returns null for an element that is not on the page", () => {
    expect(setPageLink(html, "zz", "page-2")).toBeNull();
  });

  it("resolves a node id from the outline on a page saved without ids", () => {
    // get_page_outline stamps ids on the fly, so link_element has to stamp the same way.
    const unstamped = '<html><body><main><a href="#">Start</a></main></body></html>';
    const id = /<a data-wirely-id="([a-z0-9]+)"/.exec(stampNodeIds(unstamped))?.[1] ?? "";
    expect(readPageLinks(setPageLink(unstamped, id, "page-2") ?? "")).toEqual([
      { nodeId: id, targetPageId: "page-2", label: "Start" },
    ]);
  });

  it("survives the sanitizer and is stripped from exported HTML", () => {
    const linked = setPageLink(html, "a1", "page-2") ?? "";
    expect(readPageLinks(sanitizeIframeHtml(linked))).toHaveLength(1);
    expect(stripWirelyArtifacts(linked)).not.toContain(PAGE_LINK_ATTRIBUTE);
  });
});

describe("addPlayScript", () => {
  // Runs a page with the play script in jsdom. In a top-level window `parent`
  // is the window itself, so its postMessage stands in for the viewer's.
  const play = (body: string) => {
    const messages: unknown[] = [];
    const dom = new JSDOM(addPlayScript(`<html><body>${body}</body></html>`), {
      runScripts: "dangerously",
      beforeParse: (window) => {
        window.postMessage = (message: unknown) => messages.push(message);
      },
    });
    const click = (selector: string) => {
      const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
      dom.window.document.querySelector(selector)!.dispatchEvent(event);
      return event;
    };
    return { dom, messages, click };
  };
  const page = `<a id="hot" href="/pricing" ${PAGE_LINK_ATTRIBUTE}="page-2"><span id="inner">See pricing</span></a>
    <a id="away" href="https://example.com">Docs</a><a id="hash" href="#faq">FAQ</a><p id="text">Hi</p>`;

  it("sends the hotspot's target page when anything inside it is clicked", () => {
    const { messages, click } = play(page);
    expect(click("#inner").defaultPrevented).toBe(true);
    expect(messages).toEqual([{ type: PLAY_GOTO_MESSAGE, pageId: "page-2" }]);
  });

  it("keeps an ordinary link from leaving Play, but lets a hash link scroll", () => {
    const { messages, click } = play(page);
    expect(click("#away").defaultPrevented).toBe(true);
    expect(click("#hash").defaultPrevented).toBe(false);
    expect(messages).toEqual([]);
  });

  it("outlines the hotspots after a missed click, then clears the outline", async () => {
    const { dom, click } = play(page);
    const root = dom.window.document.documentElement;
    click("#text");
    expect(root.classList.contains("wirely-hint")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(root.classList.contains("wirely-hint")).toBe(false);
  });

  it("shows no outline on a page without hotspots", () => {
    const { dom, click } = play('<p id="text">Hi</p>');
    click("#text");
    expect(dom.window.document.documentElement.classList.contains("wirely-hint")).toBe(false);
  });

  it("forwards arrow keys to the viewer and ignores other keys", () => {
    const { dom, messages } = play(page);
    for (const key of ["ArrowRight", "a", "ArrowLeft"]) {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key }));
    }
    expect(messages).toEqual([
      { type: PLAY_KEY_MESSAGE, key: "ArrowRight" },
      { type: PLAY_KEY_MESSAGE, key: "ArrowLeft" },
    ]);
  });
});
