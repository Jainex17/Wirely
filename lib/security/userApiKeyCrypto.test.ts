import { afterEach, describe, expect, it } from "bun:test";
import {
  decryptUserApiKey,
  encryptUserApiKey,
  isUserApiKeyCryptoError,
} from "@/lib/security/userApiKeyCrypto";

const MASTER_SECRET = Buffer.from("a".repeat(32), "utf8").toString("base64");
const PREVIOUS_SECRET = Buffer.from("b".repeat(32), "utf8").toString("base64");

const ORIGINAL_ENV = {
  USER_API_KEY_MASTER_SECRET_BASE64: process.env.USER_API_KEY_MASTER_SECRET_BASE64,
  USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64:
    process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64,
  USER_API_KEY_KEY_VERSION: process.env.USER_API_KEY_KEY_VERSION,
};

afterEach(() => {
  process.env.USER_API_KEY_MASTER_SECRET_BASE64 =
    ORIGINAL_ENV.USER_API_KEY_MASTER_SECRET_BASE64;
  process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64 =
    ORIGINAL_ENV.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64;
  process.env.USER_API_KEY_KEY_VERSION = ORIGINAL_ENV.USER_API_KEY_KEY_VERSION;
});

describe("userApiKeyCrypto", () => {
  it("encrypts and decrypts for the same user", () => {
    process.env.USER_API_KEY_MASTER_SECRET_BASE64 = MASTER_SECRET;
    process.env.USER_API_KEY_KEY_VERSION = "1";
    delete process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64;

    const encrypted = encryptUserApiKey({
      userId: "user-1",
      plaintextKey: "AIza-abc-123",
    });
    const decrypted = decryptUserApiKey({
      userId: "user-1",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      hmac: encrypted.hmac,
      keyVersion: encrypted.keyVersion,
    });

    expect(decrypted).toBe("AIza-abc-123");
  });

  it("keeps userId in API signature but encryption is key-based", () => {
    process.env.USER_API_KEY_MASTER_SECRET_BASE64 = MASTER_SECRET;
    process.env.USER_API_KEY_KEY_VERSION = "1";
    delete process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64;

    const encrypted = encryptUserApiKey({
      userId: "user-1",
      plaintextKey: "AIza-abc-123",
    });

    const decrypted = decryptUserApiKey({
      userId: "user-2",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      hmac: encrypted.hmac,
      keyVersion: encrypted.keyVersion,
    });
    expect(decrypted).toBe("AIza-abc-123");
  });

  it("fails when ciphertext, iv, tag, or keyVersion are tampered", () => {
    process.env.USER_API_KEY_MASTER_SECRET_BASE64 = MASTER_SECRET;
    process.env.USER_API_KEY_KEY_VERSION = "1";
    delete process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64;

    const encrypted = encryptUserApiKey({
      userId: "user-1",
      plaintextKey: "AIza-abc-123",
    });

    const tamperedCiphertext =
      encrypted.ciphertext.slice(0, -2) +
      (encrypted.ciphertext.endsWith("AA") ? "AB" : "AA");

    expect(() =>
      decryptUserApiKey({
        userId: "user-1",
        ciphertext: tamperedCiphertext,
        iv: encrypted.iv,
        hmac: encrypted.hmac,
        keyVersion: encrypted.keyVersion,
      }),
    ).toThrow();

    const tamperedTag =
      encrypted.hmac.slice(0, -2) + (encrypted.hmac.endsWith("AA") ? "AB" : "AA");
    expect(() =>
      decryptUserApiKey({
        userId: "user-1",
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        hmac: tamperedTag,
        keyVersion: encrypted.keyVersion,
      }),
    ).toThrow();

    expect(() =>
      decryptUserApiKey({
        userId: "user-1",
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        hmac: encrypted.hmac,
        keyVersion: encrypted.keyVersion + 1,
      }),
    ).toThrow();
  });

  it("supports decrypting with previous master secret during rotation", () => {
    process.env.USER_API_KEY_MASTER_SECRET_BASE64 = PREVIOUS_SECRET;
    process.env.USER_API_KEY_KEY_VERSION = "1";
    delete process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64;

    const encrypted = encryptUserApiKey({
      userId: "user-rotation",
      plaintextKey: "AIza-old-secret",
    });

    process.env.USER_API_KEY_MASTER_SECRET_BASE64 = MASTER_SECRET;
    process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64 = PREVIOUS_SECRET;
    process.env.USER_API_KEY_KEY_VERSION = "2";

    const decrypted = decryptUserApiKey({
      userId: "user-rotation",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      hmac: encrypted.hmac,
      keyVersion: encrypted.keyVersion,
    });

    expect(decrypted).toBe("AIza-old-secret");
  });

  it("returns a crypto config error when master secret is missing", () => {
    delete process.env.USER_API_KEY_MASTER_SECRET_BASE64;
    process.env.USER_API_KEY_KEY_VERSION = "1";

    try {
      encryptUserApiKey({
        userId: "user-1",
        plaintextKey: "AIza-abc-123",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(isUserApiKeyCryptoError(error)).toBe(true);
      if (isUserApiKeyCryptoError(error)) {
        expect(error.code).toBe("CRYPTO_CONFIG_ERROR");
      }
    }
  });
});
