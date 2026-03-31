import { describe, expect, it } from "bun:test";
import { toPublicUserAiSettings } from "@/lib/db/queries/users";

describe("toPublicUserAiSettings", () => {
  it("returns only public AI settings without exposing raw api keys", () => {
    const publicSettings = toPublicUserAiSettings({
      googleApiKeyCiphertext: "ciphertext",
      googleApiKeyIv: "iv",
      googleApiKeyHmac: "hmac",
      googleApiKeyKeyVersion: 1,
      openRouterApiKeyCiphertext: "or_ciphertext",
      openRouterApiKeyIv: "or_iv",
      openRouterApiKeyHmac: "or_hmac",
      openRouterApiKeyKeyVersion: 1,
      unsplashApiKeyCiphertext: "uns_ciphertext",
      unsplashApiKeyIv: "uns_iv",
      unsplashApiKeyHmac: "uns_hmac",
      unsplashApiKeyKeyVersion: 1,
      enabledGoogleModels: ["gemini-2.5-pro", "gemini-2.5-flash-lite"],
    });

    expect(publicSettings).toEqual({
      hasGoogleApiKey: true,
      hasOpenRouterApiKey: true,
      hasUnsplashApiKey: true,
      enabledModelIds: ["gemini-2.5-flash-lite", "gemini-2.5-pro"],
    });
    expect(
      Object.prototype.hasOwnProperty.call(publicSettings, "googleApiKey"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        publicSettings,
        "googleApiKeyCiphertext",
      ),
    ).toBe(false);
  });

  it("marks api key as not configured when encrypted key material is incomplete", () => {
    const publicSettings = toPublicUserAiSettings({
      googleApiKeyCiphertext: "ciphertext",
      googleApiKeyIv: null,
      googleApiKeyHmac: "hmac",
      googleApiKeyKeyVersion: 1,
      openRouterApiKeyCiphertext: "or_ciphertext",
      openRouterApiKeyIv: null,
      openRouterApiKeyHmac: "or_hmac",
      openRouterApiKeyKeyVersion: 1,
      unsplashApiKeyCiphertext: "uns_ciphertext",
      unsplashApiKeyIv: null,
      unsplashApiKeyHmac: "uns_hmac",
      unsplashApiKeyKeyVersion: 1,
      enabledGoogleModels: ["gemini-2.5-flash"],
    });

    expect(publicSettings).toEqual({
      hasGoogleApiKey: false,
      hasOpenRouterApiKey: false,
      hasUnsplashApiKey: false,
      enabledModelIds: ["gemini-2.5-flash"],
    });
  });
});
