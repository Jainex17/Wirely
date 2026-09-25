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

type UserEnabledGoogleModels = typeof users.$inferSelect["enabledGoogleModels"];

export interface UpsertUserInput {
  authSub: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

export const getUserByAuthSub = async (authSub: string) => {
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      authSub: users.authSub,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.authSub, authSub))
    .limit(1);

  return user ?? null;
};

export interface UserWithAiSettings {
  user: {
    id: string;
    authSub: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
  aiSettings: UserAiSettings;
}

// Identity and AI settings live on the same users row, so callers that need
// both (the home page) can read them in one query instead of two.
export const getUserWithAiSettingsByAuthSub = async (
  authSub: string,
): Promise<UserWithAiSettings | null> => {
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      authSub: users.authSub,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      googleApiKeyCiphertext: users.googleApiKeyCiphertext,
      googleApiKeyIv: users.googleApiKeyIv,
      googleApiKeyHmac: users.googleApiKeyHmac,
      googleApiKeyKeyVersion: users.googleApiKeyKeyVersion,
      openRouterApiKeyCiphertext: users.openRouterApiKeyCiphertext,
      openRouterApiKeyIv: users.openRouterApiKeyIv,
      openRouterApiKeyHmac: users.openRouterApiKeyHmac,
      openRouterApiKeyKeyVersion: users.openRouterApiKeyKeyVersion,
      zaiApiKeyCiphertext: users.zaiApiKeyCiphertext,
      zaiApiKeyIv: users.zaiApiKeyIv,
      zaiApiKeyHmac: users.zaiApiKeyHmac,
      zaiApiKeyKeyVersion: users.zaiApiKeyKeyVersion,
      unsplashApiKeyCiphertext: users.unsplashApiKeyCiphertext,
      unsplashApiKeyIv: users.unsplashApiKeyIv,
      unsplashApiKeyHmac: users.unsplashApiKeyHmac,
      unsplashApiKeyKeyVersion: users.unsplashApiKeyKeyVersion,
      enabledGoogleModels: users.enabledGoogleModels,
    })
    .from(users)
    .where(eq(users.authSub, authSub))
    .limit(1);

  if (!user) return null;

  return {
    user: {
      id: user.id,
      authSub: user.authSub,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    aiSettings: toPublicUserAiSettings(user),
  };
};

export interface UserAiSettings {
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
  hasUnsplashApiKey: boolean;
  enabledModelIds: WireModelName[];
}

export interface UserAiSettingsForGeneration {
  googleApiKey: string | null;
  openRouterApiKey: string | null;
  zaiApiKey: string | null;
  unsplashApiKey: string | null;
  enabledModelIds: WireModelName[];
}

export interface UpdateUserAiSettingsInput {
  userId: string;
  googleApiKey?: string;
  clearGoogleApiKey?: boolean;
  openRouterApiKey?: string;
  clearOpenRouterApiKey?: boolean;
  zaiApiKey?: string;
  clearZaiApiKey?: boolean;
  unsplashApiKey?: string;
  clearUnsplashApiKey?: boolean;
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
  openRouterApiKeyCiphertext,
  openRouterApiKeyIv,
  openRouterApiKeyHmac,
  openRouterApiKeyKeyVersion,
  zaiApiKeyCiphertext,
  zaiApiKeyIv,
  zaiApiKeyHmac,
  zaiApiKeyKeyVersion,
  unsplashApiKeyCiphertext,
  unsplashApiKeyIv,
  unsplashApiKeyHmac,
  unsplashApiKeyKeyVersion,
  enabledGoogleModels,
}: {
  googleApiKeyCiphertext: string | null | undefined;
  googleApiKeyIv: string | null | undefined;
  googleApiKeyHmac: string | null | undefined;
  googleApiKeyKeyVersion: number | null | undefined;
  openRouterApiKeyCiphertext: string | null | undefined;
  openRouterApiKeyIv: string | null | undefined;
  openRouterApiKeyHmac: string | null | undefined;
  openRouterApiKeyKeyVersion: number | null | undefined;
  zaiApiKeyCiphertext: string | null | undefined;
  zaiApiKeyIv: string | null | undefined;
  zaiApiKeyHmac: string | null | undefined;
  zaiApiKeyKeyVersion: number | null | undefined;
  unsplashApiKeyCiphertext: string | null | undefined;
  unsplashApiKeyIv: string | null | undefined;
  unsplashApiKeyHmac: string | null | undefined;
  unsplashApiKeyKeyVersion: number | null | undefined;
  enabledGoogleModels: UserEnabledGoogleModels;
}): UserAiSettings => ({
  hasGoogleApiKey: hasEncryptedApiKeyMaterial({
    ciphertext: googleApiKeyCiphertext,
    iv: googleApiKeyIv,
    hmac: googleApiKeyHmac,
    keyVersion: googleApiKeyKeyVersion,
  }),
  hasOpenRouterApiKey: hasEncryptedApiKeyMaterial({
    ciphertext: openRouterApiKeyCiphertext,
    iv: openRouterApiKeyIv,
    hmac: openRouterApiKeyHmac,
    keyVersion: openRouterApiKeyKeyVersion,
  }),
  hasZaiApiKey: hasEncryptedApiKeyMaterial({
    ciphertext: zaiApiKeyCiphertext,
    iv: zaiApiKeyIv,
    hmac: zaiApiKeyHmac,
    keyVersion: zaiApiKeyKeyVersion,
  }),
  hasUnsplashApiKey: hasEncryptedApiKeyMaterial({
    ciphertext: unsplashApiKeyCiphertext,
    iv: unsplashApiKeyIv,
    hmac: unsplashApiKeyHmac,
    keyVersion: unsplashApiKeyKeyVersion,
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
      openRouterApiKeyCiphertext: users.openRouterApiKeyCiphertext,
      openRouterApiKeyIv: users.openRouterApiKeyIv,
      openRouterApiKeyHmac: users.openRouterApiKeyHmac,
      openRouterApiKeyKeyVersion: users.openRouterApiKeyKeyVersion,
      zaiApiKeyCiphertext: users.zaiApiKeyCiphertext,
      zaiApiKeyIv: users.zaiApiKeyIv,
      zaiApiKeyHmac: users.zaiApiKeyHmac,
      zaiApiKeyKeyVersion: users.zaiApiKeyKeyVersion,
      unsplashApiKeyCiphertext: users.unsplashApiKeyCiphertext,
      unsplashApiKeyIv: users.unsplashApiKeyIv,
      unsplashApiKeyHmac: users.unsplashApiKeyHmac,
      unsplashApiKeyKeyVersion: users.unsplashApiKeyKeyVersion,
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
    openRouterApiKeyCiphertext: user.openRouterApiKeyCiphertext,
    openRouterApiKeyIv: user.openRouterApiKeyIv,
    openRouterApiKeyHmac: user.openRouterApiKeyHmac,
    openRouterApiKeyKeyVersion: user.openRouterApiKeyKeyVersion,
    zaiApiKeyCiphertext: user.zaiApiKeyCiphertext,
    zaiApiKeyIv: user.zaiApiKeyIv,
    zaiApiKeyHmac: user.zaiApiKeyHmac,
    zaiApiKeyKeyVersion: user.zaiApiKeyKeyVersion,
    unsplashApiKeyCiphertext: user.unsplashApiKeyCiphertext,
    unsplashApiKeyIv: user.unsplashApiKeyIv,
    unsplashApiKeyHmac: user.unsplashApiKeyHmac,
    unsplashApiKeyKeyVersion: user.unsplashApiKeyKeyVersion,
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
      openRouterApiKeyCiphertext: users.openRouterApiKeyCiphertext,
      openRouterApiKeyIv: users.openRouterApiKeyIv,
      openRouterApiKeyHmac: users.openRouterApiKeyHmac,
      openRouterApiKeyKeyVersion: users.openRouterApiKeyKeyVersion,
      zaiApiKeyCiphertext: users.zaiApiKeyCiphertext,
      zaiApiKeyIv: users.zaiApiKeyIv,
      zaiApiKeyHmac: users.zaiApiKeyHmac,
      zaiApiKeyKeyVersion: users.zaiApiKeyKeyVersion,
      unsplashApiKeyCiphertext: users.unsplashApiKeyCiphertext,
      unsplashApiKeyIv: users.unsplashApiKeyIv,
      unsplashApiKeyHmac: users.unsplashApiKeyHmac,
      unsplashApiKeyKeyVersion: users.unsplashApiKeyKeyVersion,
      enabledGoogleModels: users.enabledGoogleModels,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  let decryptedApiKey: string | null = null;
  if (
    hasEncryptedApiKeyMaterial({
      ciphertext: user.googleApiKeyCiphertext,
      iv: user.googleApiKeyIv,
      hmac: user.googleApiKeyHmac,
      keyVersion: user.googleApiKeyKeyVersion,
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

  let decryptedOpenRouterApiKey: string | null = null;
  if (
    hasEncryptedApiKeyMaterial({
      ciphertext: user.openRouterApiKeyCiphertext,
      iv: user.openRouterApiKeyIv,
      hmac: user.openRouterApiKeyHmac,
      keyVersion: user.openRouterApiKeyKeyVersion,
    })
  ) {
    decryptedOpenRouterApiKey = decryptUserApiKey({
      userId,
      ciphertext: user.openRouterApiKeyCiphertext as string,
      iv: user.openRouterApiKeyIv as string,
      hmac: user.openRouterApiKeyHmac as string,
      keyVersion: user.openRouterApiKeyKeyVersion as number,
    });
  }

  let decryptedZaiApiKey: string | null = null;
  if (
    hasEncryptedApiKeyMaterial({
      ciphertext: user.zaiApiKeyCiphertext,
      iv: user.zaiApiKeyIv,
      hmac: user.zaiApiKeyHmac,
      keyVersion: user.zaiApiKeyKeyVersion,
    })
  ) {
    decryptedZaiApiKey = decryptUserApiKey({
      userId,
      ciphertext: user.zaiApiKeyCiphertext as string,
      iv: user.zaiApiKeyIv as string,
      hmac: user.zaiApiKeyHmac as string,
      keyVersion: user.zaiApiKeyKeyVersion as number,
    });
  }

  let decryptedUnsplashApiKey: string | null = null;
  if (
    hasEncryptedApiKeyMaterial({
      ciphertext: user.unsplashApiKeyCiphertext,
      iv: user.unsplashApiKeyIv,
      hmac: user.unsplashApiKeyHmac,
      keyVersion: user.unsplashApiKeyKeyVersion,
    })
  ) {
    decryptedUnsplashApiKey = decryptUserApiKey({
      userId,
      ciphertext: user.unsplashApiKeyCiphertext as string,
      iv: user.unsplashApiKeyIv as string,
      hmac: user.unsplashApiKeyHmac as string,
      keyVersion: user.unsplashApiKeyKeyVersion as number,
    });
  }

  return {
    googleApiKey: decryptedApiKey,
    openRouterApiKey: decryptedOpenRouterApiKey,
    zaiApiKey: decryptedZaiApiKey,
    unsplashApiKey: decryptedUnsplashApiKey,
    enabledModelIds: resolveEnabledWireModels(user.enabledGoogleModels),
  };
};

export const updateUserAiSettings = async ({
  userId,
  googleApiKey,
  clearGoogleApiKey,
  openRouterApiKey,
  clearOpenRouterApiKey,
  zaiApiKey,
  clearZaiApiKey,
  unsplashApiKey,
  clearUnsplashApiKey,
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

  if (openRouterApiKey !== undefined) {
    const encrypted = encryptUserApiKey({
      userId,
      plaintextKey: openRouterApiKey,
    });
    setPayload.openRouterApiKeyCiphertext = encrypted.ciphertext;
    setPayload.openRouterApiKeyIv = encrypted.iv;
    setPayload.openRouterApiKeyHmac = encrypted.hmac;
    setPayload.openRouterApiKeyKeyVersion = encrypted.keyVersion;
  }

  if (clearOpenRouterApiKey) {
    setPayload.openRouterApiKeyCiphertext = null;
    setPayload.openRouterApiKeyIv = null;
    setPayload.openRouterApiKeyHmac = null;
    setPayload.openRouterApiKeyKeyVersion = null;
  }

  if (zaiApiKey !== undefined) {
    const encrypted = encryptUserApiKey({
      userId,
      plaintextKey: zaiApiKey,
    });
    setPayload.zaiApiKeyCiphertext = encrypted.ciphertext;
    setPayload.zaiApiKeyIv = encrypted.iv;
    setPayload.zaiApiKeyHmac = encrypted.hmac;
    setPayload.zaiApiKeyKeyVersion = encrypted.keyVersion;
  }

  if (clearZaiApiKey) {
    setPayload.zaiApiKeyCiphertext = null;
    setPayload.zaiApiKeyIv = null;
    setPayload.zaiApiKeyHmac = null;
    setPayload.zaiApiKeyKeyVersion = null;
  }

  if (unsplashApiKey !== undefined) {
    const encrypted = encryptUserApiKey({
      userId,
      plaintextKey: unsplashApiKey,
    });
    setPayload.unsplashApiKeyCiphertext = encrypted.ciphertext;
    setPayload.unsplashApiKeyIv = encrypted.iv;
    setPayload.unsplashApiKeyHmac = encrypted.hmac;
    setPayload.unsplashApiKeyKeyVersion = encrypted.keyVersion;
  }

  if (clearUnsplashApiKey) {
    setPayload.unsplashApiKeyCiphertext = null;
    setPayload.unsplashApiKeyIv = null;
    setPayload.unsplashApiKeyHmac = null;
    setPayload.unsplashApiKeyKeyVersion = null;
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
