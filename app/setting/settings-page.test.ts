import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("settings page", () => {
  it("hydrates from server props instead of fetching on mount", () => {
    const client = read("app/setting/SettingsClient.tsx");

    expect(client.includes("useEffect")).toBe(false);
    expect(client.includes('method: "PATCH"')).toBe(true);
    expect(read("app/setting/page.tsx").includes("getServerSessionUserWithAiSettings")).toBe(true);
  });

  it("never persists API keys to browser storage", () => {
    const source = [
      "app/setting/ApiKeyDialog.tsx",
      "app/setting/SettingsClient.tsx",
    ]
      .map(read)
      .join("\n");

    expect(source.includes("localStorage")).toBe(false);
    expect(source.includes("sessionStorage")).toBe(false);
  });

  it("keeps the old settings urls reachable", () => {
    for (const [path, tab] of [
      ["app/setting/profile/page.tsx", "account"],
      ["app/setting/provider/page.tsx", "providers"],
      ["app/setting/model/page.tsx", "models"],
    ]) {
      expect(read(path).includes(`redirect("/setting?tab=${tab}")`)).toBe(true);
    }
  });
});
