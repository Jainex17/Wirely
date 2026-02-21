import { describe, expect, it } from "bun:test";
import { sanitizeHtml, sanitizeText } from "@/lib/sanitize";
import { SECTION_LAYOUTS } from "@/lib/sectionLayouts";
import { cn } from "@/lib/utils";

describe("foundation utility behavior", () => {
  it("merges class names with tailwind conflict resolution", () => {
    const value = cn("px-2 py-4", false && "hidden", "px-6", "text-sm");
    expect(value).toContain("px-6");
    expect(value).toContain("py-4");
    expect(value).toContain("text-sm");
    expect(value.includes("px-2")).toBe(false);
  });

  it("sanitizes html/text safely in server runtime", () => {
    const dirtyHtml = `<p>Hello <strong>team</strong><script>alert("x")</script></p>`;
    const text = `<b>hello</b> <i>world</i>`;

    const sanitizedHtml = sanitizeHtml(dirtyHtml);
    const sanitizedText = sanitizeText(text);

    expect(sanitizedHtml.includes("<")).toBe(false);
    expect(sanitizedHtml.includes(">")).toBe(false);
    expect(sanitizedText).toBe("hello world");
  });

  it("keeps section layouts populated with unique ids", () => {
    const allIds = new Set<string>();

    for (const [section, options] of Object.entries(SECTION_LAYOUTS)) {
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(option.id.length).toBeGreaterThan(0);
        expect(option.name.length).toBeGreaterThan(0);
        expect(allIds.has(option.id)).toBe(false);
        allIds.add(option.id);
        const expectedPrefix = section === "navbar" ? "nav-" : `${section}-`;
        expect(option.id.startsWith(expectedPrefix)).toBe(true);
      }
    }

    expect(Object.keys(SECTION_LAYOUTS).length).toBeGreaterThanOrEqual(10);
  });
});
