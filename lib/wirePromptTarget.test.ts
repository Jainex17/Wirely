import { describe, expect, it } from "bun:test";
import {
  isNewPagePromptTarget,
  NEW_PAGE_PROMPT_TARGET_ID,
  resolvePromptTargetPageId,
  resolvePromptTargetPageTitle,
} from "@/lib/wirePromptTarget";

const pages = [
  { id: "page-1", title: "Overview" },
  { id: "page-2", title: "Pricing" },
];

describe("wirePromptTarget helpers", () => {
  it("falls back to the first page when the selected target no longer exists", () => {
    expect(resolvePromptTargetPageId(pages, "page-2")).toBe("page-2");
    expect(resolvePromptTargetPageId(pages, NEW_PAGE_PROMPT_TARGET_ID)).toBe(
      NEW_PAGE_PROMPT_TARGET_ID,
    );
    expect(resolvePromptTargetPageId(pages, "missing-page")).toBe("page-1");
    expect(resolvePromptTargetPageId([], "missing-page")).toBeNull();
  });

  it("returns the current selected page title so label updates follow page renames", () => {
    expect(resolvePromptTargetPageTitle(pages, "page-2")).toBe("Pricing");
    expect(resolvePromptTargetPageTitle(pages, NEW_PAGE_PROMPT_TARGET_ID)).toBe(
      "New page",
    );

    const renamedPages = [
      pages[0],
      { id: "page-2", title: "Plans" },
    ];

    expect(resolvePromptTargetPageTitle(renamedPages, "page-2")).toBe("Plans");
    expect(resolvePromptTargetPageTitle(renamedPages, "missing-page")).toBe(
      "Select page",
    );
  });

  it("recognizes the special new-page prompt target", () => {
    expect(isNewPagePromptTarget(NEW_PAGE_PROMPT_TARGET_ID)).toBe(true);
    expect(isNewPagePromptTarget("page-1")).toBe(false);
    expect(isNewPagePromptTarget(null)).toBe(false);
  });
});
