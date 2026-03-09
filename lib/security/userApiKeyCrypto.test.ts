import { afterEach, describe, expect, it } from "bun:test";
import { createCipheriv, randomBytes } from "crypto";
import {
  decryptUserApiKey,
  encryptUserApiKey,
  isUserApiKeyCryptoError,
} from "@/lib/security/userApiKeyCrypto";

const MASTER_SECRET = Buffer.from("a".repeat(32), "utf8").toString("base64");
const PREVIOUS_SECRET = Buffer.from("b".repeat(32), "utf8").toString("base64");
const LEGACY_AAD_PREFIX = "wirely:user-api-key:v";

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

const encryptLegacyWithoutUserBinding = ({
  plaintextKey,
  keyVersion,
  masterSecret,
}: {
  plaintextKey: string;
  keyVersion: number;
  masterSecret: string;
}) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(masterSecret, "base64"),
    iv,
  );
  cipher.setAAD(Buffer.from(`${LEGACY_AAD_PREFIX}${keyVersion}`, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintextKey, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    hmac: authTag.toString("base64"),
    keyVersion,
  };
};

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

  it("binds encrypted keys to userId", () => {
    process.env.USER_API_KEY_MASTER_SECRET_BASE64 = MASTER_SECRET;
    process.env.USER_API_KEY_KEY_VERSION = "1";
    delete process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64;

    const encrypted = encryptUserApiKey({
      userId: "user-1",
      plaintextKey: "AIza-abc-123",
    });

    expect(() =>
      decryptUserApiKey({
        userId: "user-2",
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        hmac: encrypted.hmac,
        keyVersion: encrypted.keyVersion,
      }),
    ).toThrow();
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

  it("supports decrypting legacy payloads that are not user-bound", () => {
    process.env.USER_API_KEY_MASTER_SECRET_BASE64 = MASTER_SECRET;
    process.env.USER_API_KEY_KEY_VERSION = "2";
    delete process.env.USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64;

    const legacyEncrypted = encryptLegacyWithoutUserBinding({
      plaintextKey: "AIza-legacy-secret",
      keyVersion: 1,
      masterSecret: MASTER_SECRET,
    });

    const decrypted = decryptUserApiKey({
      userId: "user-legacy",
      ciphertext: legacyEncrypted.ciphertext,
      iv: legacyEncrypted.iv,
      hmac: legacyEncrypted.hmac,
      keyVersion: legacyEncrypted.keyVersion,
    });

    expect(decrypted).toBe("AIza-legacy-secret");
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
