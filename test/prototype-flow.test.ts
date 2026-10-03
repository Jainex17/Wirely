import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { findNavigationMismatches, parseFlowInput } from "@/lib/prototypeFlow";

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

  it("exposes the prototype dialog from the editor header", () => {
    const source = read("app/wire/[id]/WireEditor.tsx");

    expect(source.includes("PrototypeFlowDialog")).toBe(true);
    expect(source.includes("setIsPrototypeDialogOpen(true)")).toBe(true);
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
