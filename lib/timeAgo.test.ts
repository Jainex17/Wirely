import { describe, expect, it } from "bun:test";
import { timeAgo } from "./timeAgo";

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

describe("timeAgo", () => {
  it("uses the singular for one unit", () => {
    expect(timeAgo(ago(40 * 86400))).toBe("1 month ago");
    expect(timeAgo(ago(3600))).toBe("1 hour ago");
  });

  it("uses the plural for more than one unit", () => {
    expect(timeAgo(ago(70 * 86400))).toBe("2 months ago");
    expect(timeAgo(ago(5 * 60))).toBe("5 minutes ago");
  });

  it("keeps days short and treats the last minute as now", () => {
    expect(timeAgo(ago(4 * 86400))).toBe("4d ago");
    expect(timeAgo(ago(20))).toBe("just now");
  });
});
