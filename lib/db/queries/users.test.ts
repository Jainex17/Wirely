import { describe, expect, it } from "bun:test";
import { toPublicUserAiSettings } from "@/lib/db/queries/users";

describe("toPublicUserAiSettings", () => {
  it("returns only public AI settings without exposing raw api keys", () => {
    const publicSettings = toPublicUserAiSettings({
      googleApiKey: "secret-key-value",
      enabledGoogleModels: ["gemini-2.5-pro", "gemini-2.5-flash-lite"],
    });

    expect(publicSettings).toEqual({
      hasGoogleApiKey: true,
      enabledModelIds: ["gemini-2.5-flash-lite", "gemini-2.5-pro"],
    });
    expect(
      Object.prototype.hasOwnProperty.call(publicSettings, "googleApiKey"),
    ).toBe(false);
  });
});
