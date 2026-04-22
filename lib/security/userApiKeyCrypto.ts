import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const MASTER_SECRET_ENV = "USER_API_KEY_MASTER_SECRET_BASE64";
const PREVIOUS_MASTER_SECRET_ENV = "USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64";
const KEY_VERSION_ENV = "USER_API_KEY_KEY_VERSION";
const AES_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_LENGTH_BYTES = 32;
const GCM_IV_LENGTH_BYTES = 12;
const GCM_AUTH_TAG_LENGTH_BYTES = 16;

type CryptoConfig = {
  currentMasterSecret: Buffer;
  previousMasterSecret?: Buffer;
  currentKeyVersion: number;
};

export class UserApiKeyCryptoError extends Error {
  code: "CRYPTO_CONFIG_ERROR" | "INVALID_ENCRYPTED_API_KEY";

  constructor(
    code: "CRYPTO_CONFIG_ERROR" | "INVALID_ENCRYPTED_API_KEY",
    message: string,
  ) {
    super(message);
    this.name = "UserApiKeyCryptoError";
    this.code = code;
  }
}

export const isUserApiKeyCryptoError = (
  value: unknown,
): value is UserApiKeyCryptoError =>
  value instanceof UserApiKeyCryptoError;

const decodeBase64 = (value: string): Buffer => Buffer.from(value, "base64");

const readMasterSecret = (envName: string): Buffer => {
  const raw = process.env[envName];
  if (!raw) {
    throw new UserApiKeyCryptoError(
      "CRYPTO_CONFIG_ERROR",
      `${envName} is required for API key encryption.`,
    );
  }

  const decoded = decodeBase64(raw);
  if (decoded.length !== ENCRYPTION_KEY_LENGTH_BYTES) {
    throw new UserApiKeyCryptoError(
      "CRYPTO_CONFIG_ERROR",
      `${envName} must decode to exactly ${ENCRYPTION_KEY_LENGTH_BYTES} bytes.`,
    );
  }

  return decoded;
};

const readOptionalMasterSecret = (envName: string): Buffer | undefined => {
  const raw = process.env[envName];
  if (!raw) return undefined;

  const decoded = decodeBase64(raw);
  if (decoded.length !== ENCRYPTION_KEY_LENGTH_BYTES) {
    throw new UserApiKeyCryptoError(
      "CRYPTO_CONFIG_ERROR",
      `${envName} must decode to exactly ${ENCRYPTION_KEY_LENGTH_BYTES} bytes.`,
    );
  }

  return decoded;
};

const readKeyVersion = (): number => {
  const raw = process.env[KEY_VERSION_ENV] ?? "1";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UserApiKeyCryptoError(
      "CRYPTO_CONFIG_ERROR",
      `${KEY_VERSION_ENV} must be a positive integer.`,
    );
  }
  return parsed;
};

const readCryptoConfig = (): CryptoConfig => ({
  currentMasterSecret: readMasterSecret(MASTER_SECRET_ENV),
  previousMasterSecret: readOptionalMasterSecret(PREVIOUS_MASTER_SECRET_ENV),
  currentKeyVersion: readKeyVersion(),
});

const normalizeUserId = (userId: string) => {
  const normalized = userId.trim();
  if (!normalized) {
    throw new UserApiKeyCryptoError(
      "INVALID_ENCRYPTED_API_KEY",
      "userId is required for API key encryption.",
    );
  }
  return normalized;
};

const getLegacyAad = (keyVersion: number) =>
  Buffer.from(`wirely:user-api-key:v${keyVersion}`, "utf8");

const getUserBoundAad = ({
  keyVersion,
  userId,
}: {
  keyVersion: number;
  userId: string;
}) =>
  Buffer.from(
    `wirely:user-api-key:v${keyVersion}:user:${normalizeUserId(userId)}`,
    "utf8",
  );

export const encryptUserApiKey = ({
  userId,
  plaintextKey,
}: {
  userId: string;
  plaintextKey: string;
}) => {
  const normalizedUserId = normalizeUserId(userId);

  const trimmed = plaintextKey.trim();
  if (!trimmed) {
    throw new UserApiKeyCryptoError(
      "INVALID_ENCRYPTED_API_KEY",
      "Cannot encrypt an empty API key.",
    );
  }

  const config = readCryptoConfig();
  const keyVersion = config.currentKeyVersion;
  const iv = randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, config.currentMasterSecret, iv);
  cipher.setAAD(getUserBoundAad({ keyVersion, userId: normalizedUserId }));

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(trimmed, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    hmac: authTag.toString("base64"), // legacy field name, stores GCM auth tag.
    keyVersion,
  };
};

const tryDecryptWithSecret = ({
  masterSecret,
  ciphertext,
  iv,
  hmac,
  aad,
}: {
  masterSecret: Buffer;
  ciphertext: string;
  iv: string;
  hmac: string;
  aad: Buffer;
}) => {
  const ivBuffer = Buffer.from(iv, "base64");
  const ciphertextBuffer = Buffer.from(ciphertext, "base64");
  const authTagBuffer = Buffer.from(hmac, "base64");

  if (ivBuffer.length !== GCM_IV_LENGTH_BYTES) {
    throw new UserApiKeyCryptoError(
      "INVALID_ENCRYPTED_API_KEY",
      `Invalid IV length; expected ${GCM_IV_LENGTH_BYTES} bytes.`,
    );
  }
  if (authTagBuffer.length !== GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new UserApiKeyCryptoError(
      "INVALID_ENCRYPTED_API_KEY",
      `Invalid auth tag length; expected ${GCM_AUTH_TAG_LENGTH_BYTES} bytes.`,
    );
  }
  if (ciphertextBuffer.length === 0) {
    throw new UserApiKeyCryptoError(
      "INVALID_ENCRYPTED_API_KEY",
      "Encrypted API key ciphertext is empty.",
    );
  }

  const decipher = createDecipheriv(AES_ALGORITHM, masterSecret, ivBuffer);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTagBuffer);
  const plaintext = Buffer.concat([
    decipher.update(ciphertextBuffer),
    decipher.final(),
  ]).toString("utf8");
  return plaintext.trim();
};

const isExpectedDecryptionFailure = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as { code?: string }).code;
  return (
    code === "ERR_OSSL_EVP_BAD_DECRYPT" ||
    error.message.includes("unable to authenticate data") ||
    error.message.includes("bad decrypt")
  );
};

export const decryptUserApiKey = ({
  userId,
  ciphertext,
  iv,
  hmac,
  keyVersion,
}: {
  userId: string;
  ciphertext: string;
  iv: string;
  hmac: string;
  keyVersion: number;
}) => {
  const normalizedUserId = normalizeUserId(userId);

  if (
    !ciphertext ||
    !iv ||
    !hmac ||
    !Number.isInteger(keyVersion) ||
    keyVersion <= 0
  ) {
    throw new UserApiKeyCryptoError(
      "INVALID_ENCRYPTED_API_KEY",
      "Encrypted API key material is incomplete.",
    );
  }

  const config = readCryptoConfig();
  const candidateMasterSecrets = [
    config.currentMasterSecret,
    ...(config.previousMasterSecret ? [config.previousMasterSecret] : []),
  ];
  const aadCandidates = [
    getUserBoundAad({ keyVersion, userId: normalizedUserId }),
    // Backward compatibility for keys encrypted before user-bound AAD.
    getLegacyAad(keyVersion),
  ];

  // Try both current and previous secrets, plus the legacy AAD shape, but only
  // suppress authentication failures. Input validation errors still surface.
  for (const masterSecret of candidateMasterSecrets) {
    for (const aad of aadCandidates) {
      try {
        const decrypted = tryDecryptWithSecret({
          masterSecret,
          ciphertext,
          iv,
          hmac,
          aad,
        });
        if (!decrypted) {
          throw new UserApiKeyCryptoError(
            "INVALID_ENCRYPTED_API_KEY",
            "Decrypted API key is empty.",
          );
        }
        return decrypted;
      } catch (error) {
        if (error instanceof UserApiKeyCryptoError) {
          throw error;
        }

        if (!isExpectedDecryptionFailure(error)) {
          throw error;
        }
      }
    }
  }

  throw new UserApiKeyCryptoError(
    "INVALID_ENCRYPTED_API_KEY",
    "Encrypted API key could not be decrypted.",
  );
};

export const hasEncryptedApiKeyMaterial = (record: {
  ciphertext: string | null | undefined;
  iv: string | null | undefined;
  hmac: string | null | undefined;
  keyVersion: number | null | undefined;
}) =>
  Boolean(
    record.ciphertext &&
      record.iv &&
      record.hmac &&
      typeof record.keyVersion === "number" &&
      Number.isInteger(record.keyVersion) &&
      record.keyVersion > 0,
  );
