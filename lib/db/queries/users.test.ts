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
      zaiApiKeyCiphertext: "zai_ciphertext",
      zaiApiKeyIv: "zai_iv",
      zaiApiKeyHmac: "zai_hmac",
      zaiApiKeyKeyVersion: 1,
      unsplashApiKeyCiphertext: "uns_ciphertext",
      unsplashApiKeyIv: "uns_iv",
      unsplashApiKeyHmac: "uns_hmac",
      unsplashApiKeyKeyVersion: 1,
      enabledGoogleModels: ["gemini-3.1-pro-preview", "gemini-3.5-flash-lite"],
      customLocalModels: ["zai-coding-plan/glm-4.6"],
    });

    expect(publicSettings).toEqual({
      hasGoogleApiKey: true,
      hasOpenRouterApiKey: true,
      hasZaiApiKey: true,
      hasUnsplashApiKey: true,
      enabledModelIds: ["gemini-3.5-flash-lite", "gemini-3.1-pro-preview"],
      customLocalModelIds: ["zai-coding-plan/glm-4.6"],
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
      zaiApiKeyCiphertext: "zai_ciphertext",
      zaiApiKeyIv: null,
      zaiApiKeyHmac: "zai_hmac",
      zaiApiKeyKeyVersion: 1,
      unsplashApiKeyCiphertext: "uns_ciphertext",
      unsplashApiKeyIv: null,
      unsplashApiKeyHmac: "uns_hmac",
      unsplashApiKeyKeyVersion: 1,
      enabledGoogleModels: ["gemini-3.8-flash"],
      customLocalModels: [],
    });

    expect(publicSettings).toEqual({
      hasGoogleApiKey: false,
      hasOpenRouterApiKey: false,
      hasZaiApiKey: false,
      hasUnsplashApiKey: false,
      enabledModelIds: ["gemini-3.8-flash"],
      customLocalModelIds: [],
    });
  });
});
