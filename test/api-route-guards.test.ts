import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("api route guard coverage", () => {
  it("enforces authentication across project route handlers", () => {
    const routes = [
      "app/api/projects/route.ts",
      "app/api/projects/[projectId]/route.ts",
      "app/api/projects/[projectId]/pages/route.ts",
      "app/api/projects/[projectId]/pages/[pageId]/route.ts",
      "app/api/profile/ai-settings/route.ts",
      "app/api/profile/details/route.ts",
      "app/api/wire/[id]/route.ts",
    ];

    for (const path of routes) {
      const source = read(path);
      expect(source.includes("getRequestSessionUser")).toBe(true);
      expect(source.includes("Unauthenticated")).toBe(true);
    }
  });

  it("keeps project creation/list route request parsing and status handling", () => {
    const source = read("app/api/projects/route.ts");

    expect(source.includes("readJsonBodyWithLimit")).toBe(true);
    expect(source.includes("return parsed.response")).toBe(true);
    expect(source.includes("{ status: 201 }")).toBe(true);
    expect(source.includes("Failed to create project.")).toBe(true);
  });

  it("keeps project page update/delete safeguards", () => {
    const source = read("app/api/projects/[projectId]/pages/[pageId]/route.ts");

    expect(source.includes("No updates provided.")).toBe(true);
    expect(source.includes("{ status: 400 }")).toBe(true);
    expect(source.includes("Cannot delete the only page in a project.")).toBe(true);
    expect(source.includes("{ status: 409 }")).toBe(true);
  });

  it("keeps profile AI settings validation and crypto error handling", () => {
    const source = read("app/api/profile/ai-settings/route.ts");

    expect(source.includes("MAX_GOOGLE_API_KEY_LENGTH")).toBe(true);
    expect(source.includes("MAX_OPENROUTER_API_KEY_LENGTH")).toBe(true);
    expect(source.includes("enabledModelIds must be an array")).toBe(true);
    expect(source.includes("Provide either googleApiKey or clearGoogleApiKey")).toBe(
      true,
    );
    expect(
      source.includes(
        "Provide either openRouterApiKey or clearOpenRouterApiKey, not both.",
      ),
    ).toBe(true);
    expect(source.includes("CRYPTO_CONFIG_ERROR")).toBe(true);
  });

  it("keeps profile details validation", () => {
    const source = read("app/api/profile/details/route.ts");

    expect(source.includes("MAX_NAME_LENGTH")).toBe(true);
    expect(source.includes("name must be a string")).toBe(true);
    expect(source.includes("Unable to update profile details.")).toBe(true);
  });

  it("keeps wire generation route runtime and rate limiting protections", () => {
    const source = read("app/api/wire/[id]/route.ts");

    expect(source.includes('export const runtime = "nodejs"')).toBe(true);
    expect(source.includes("export const maxDuration = 60")).toBe(true);
    expect(source.includes("createRateLimiter()")).toBe(true);
    expect(source.includes("withRateLimitHeaders")).toBe(true);
    expect(source.includes("MAX_MESSAGE_COUNT = 60")).toBe(true);
  });
});
