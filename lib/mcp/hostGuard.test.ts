import { describe, expect, it } from "bun:test";
import { createHostGuard, requestHostname } from "@/lib/mcp/hostGuard";

describe("createHostGuard", () => {
  it("refuses private and loopback hosts without fetching them", async () => {
    const isAllowedHost = createHostGuard();
    expect(await isAllowedHost("127.0.0.1")).toBe(false);
    expect(await isAllowedHost("localhost")).toBe(false);
    expect(await isAllowedHost("10.0.0.5")).toBe(false);
    expect(await isAllowedHost("169.254.169.254")).toBe(false);
  });
});

describe("requestHostname", () => {
  it("returns the host of http and https URLs only", () => {
    expect(requestHostname("https://images.example.com/a.png")).toBe("images.example.com");
    expect(requestHostname("file:///etc/passwd")).toBeNull();
    expect(requestHostname("not a url")).toBeNull();
  });
});
