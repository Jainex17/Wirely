import { describe, expect, it } from "bun:test";

import { PAGE_SHARE_TTL_MS, createPageSharePath, verifyPageShare } from "@/lib/pageShare";

const secret = Buffer.alloc(32, 7);
const now = 1_000_000;

const parse = (path: string) => {
  const url = new URL(path, "https://wirely.test");
  return {
    pageId: decodeURIComponent(url.pathname.split("/").pop() ?? ""),
    exp: url.searchParams.get("exp"),
    sig: url.searchParams.get("sig"),
  };
};

describe("page share links", () => {
  it("accepts its own link until it expires", () => {
    const link = parse(createPageSharePath("page-1", now, secret).path);

    expect(link.pageId).toBe("page-1");
    expect(verifyPageShare(link, now + 1, secret)).toBe(true);
    expect(verifyPageShare(link, now + PAGE_SHARE_TTL_MS, secret)).toBe(false);
  });

  it("rejects a link moved to another page, extended, or signed with another secret", () => {
    const link = parse(createPageSharePath("page-1", now, secret).path);

    expect(verifyPageShare({ ...link, pageId: "page-2" }, now, secret)).toBe(false);
    expect(verifyPageShare({ ...link, exp: String(Number(link.exp) + 1) }, now, secret)).toBe(false);
    expect(verifyPageShare(link, now, Buffer.alloc(32, 8))).toBe(false);
    expect(verifyPageShare({ ...link, sig: null }, now, secret)).toBe(false);
  });
});
