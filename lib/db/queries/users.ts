import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  decryptUserApiKey,
  encryptUserApiKey,
  hasEncryptedApiKeyMaterial,
} from "@/lib/security/userApiKeyCrypto";
import {
  normalizeEnabledWireModels,
  resolveEnabledWireModels,
  type WireModelName,
} from "@/lib/wireModels";

export interface UpsertUserInput {
  authSub: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

export const getUserByAuthSub = async (authSub: string) => {
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.authSub, authSub))
    .limit(1);

  return user ?? null;
};

export interface UserAiSettings {
  hasGoogleApiKey: boolean;
  enabledModelIds: WireModelName[];
}

export interface UserAiSettingsForGeneration {
  googleApiKey: string | null;
  enabledModelIds: WireModelName[];
}

export interface UpdateUserAiSettingsInput {
  userId: string;
  googleApiKey?: string;
  clearGoogleApiKey?: boolean;
  enabledGoogleModels?: WireModelName[];
}

export interface UserProfileDetails {
  name: string | null;
  email: string | null;
}

export const toPublicUserAiSettings = ({
  googleApiKeyCiphertext,
  googleApiKeyIv,
  googleApiKeyHmac,
  googleApiKeyKeyVersion,
  enabledGoogleModels,
}: {
  googleApiKeyCiphertext: string | null | undefined;
  googleApiKeyIv: string | null | undefined;
  googleApiKeyHmac: string | null | undefined;
  googleApiKeyKeyVersion: number | null | undefined;
  enabledGoogleModels: unknown;
}): UserAiSettings => ({
  hasGoogleApiKey: hasEncryptedApiKeyMaterial({
    googleApiKeyCiphertext,
    googleApiKeyIv,
    googleApiKeyHmac,
    googleApiKeyKeyVersion,
  }),
  enabledModelIds: resolveEnabledWireModels(enabledGoogleModels),
});

export const upsertUserByAuthSub = async ({
  authSub,
  email,
  name,
  avatarUrl,
}: UpsertUserInput) => {
  const db = getDb();

  const [user] = await db
    .insert(users)
    .values({
      authSub,
      email: email ?? null,
      name: name ?? null,
      avatarUrl: avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.authSub,
      set: {
        email: email ?? null,
        name: name ?? null,
        avatarUrl: avatarUrl ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return user ?? null;
};

export const getUserAiSettings = async (
  userId: string,
): Promise<UserAiSettings | null> => {
  const db = getDb();

  const [user] = await db
    .select({
      googleApiKeyCiphertext: users.googleApiKeyCiphertext,
      googleApiKeyIv: users.googleApiKeyIv,
      googleApiKeyHmac: users.googleApiKeyHmac,
      googleApiKeyKeyVersion: users.googleApiKeyKeyVersion,
      enabledGoogleModels: users.enabledGoogleModels,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  return toPublicUserAiSettings({
    googleApiKeyCiphertext: user.googleApiKeyCiphertext,
    googleApiKeyIv: user.googleApiKeyIv,
    googleApiKeyHmac: user.googleApiKeyHmac,
    googleApiKeyKeyVersion: user.googleApiKeyKeyVersion,
    enabledGoogleModels: user.enabledGoogleModels,
  });
};

export const getUserAiSettingsForGeneration = async (
  userId: string,
): Promise<UserAiSettingsForGeneration | null> => {
  const db = getDb();

  const [user] = await db
    .select({
      googleApiKeyCiphertext: users.googleApiKeyCiphertext,
      googleApiKeyIv: users.googleApiKeyIv,
      googleApiKeyHmac: users.googleApiKeyHmac,
      googleApiKeyKeyVersion: users.googleApiKeyKeyVersion,
      enabledGoogleModels: users.enabledGoogleModels,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  let decryptedApiKey: string | null = null;
  if (
    hasEncryptedApiKeyMaterial({
      googleApiKeyCiphertext: user.googleApiKeyCiphertext,
      googleApiKeyIv: user.googleApiKeyIv,
      googleApiKeyHmac: user.googleApiKeyHmac,
      googleApiKeyKeyVersion: user.googleApiKeyKeyVersion,
    })
  ) {
    decryptedApiKey = decryptUserApiKey({
      userId,
      ciphertext: user.googleApiKeyCiphertext as string,
      iv: user.googleApiKeyIv as string,
      hmac: user.googleApiKeyHmac as string,
      keyVersion: user.googleApiKeyKeyVersion as number,
    });
  }

  return {
    googleApiKey: decryptedApiKey,
    enabledModelIds: resolveEnabledWireModels(user.enabledGoogleModels),
  };
};

export const updateUserAiSettings = async ({
  userId,
  googleApiKey,
  clearGoogleApiKey,
  enabledGoogleModels,
}: UpdateUserAiSettingsInput): Promise<UserAiSettings | null> => {
  const db = getDb();

  const setPayload: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (googleApiKey !== undefined) {
    const encrypted = encryptUserApiKey({
      userId,
      plaintextKey: googleApiKey,
    });
    setPayload.googleApiKeyCiphertext = encrypted.ciphertext;
    setPayload.googleApiKeyIv = encrypted.iv;
    setPayload.googleApiKeyHmac = encrypted.hmac;
    setPayload.googleApiKeyKeyVersion = encrypted.keyVersion;
  }

  if (clearGoogleApiKey) {
    setPayload.googleApiKeyCiphertext = null;
    setPayload.googleApiKeyIv = null;
    setPayload.googleApiKeyHmac = null;
    setPayload.googleApiKeyKeyVersion = null;
  }

  if (enabledGoogleModels !== undefined) {
    setPayload.enabledGoogleModels = normalizeEnabledWireModels(enabledGoogleModels);
  }

  const [updated] = await db
    .update(users)
    .set(setPayload)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (!updated) return null;

  return getUserAiSettings(userId);
};

export interface UpdateUserProfileDetailsInput {
  userId: string;
  name: string | null;
}

export const updateUserProfileDetails = async ({
  userId,
  name,
}: UpdateUserProfileDetailsInput): Promise<UserProfileDetails | null> => {
  const db = getDb();

  const [updated] = await db
    .update(users)
    .set({
      name,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      name: users.name,
      email: users.email,
    });

  return updated ?? null;
};
