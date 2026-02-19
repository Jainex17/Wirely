import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
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

export const toPublicUserAiSettings = ({
  googleApiKey,
  enabledGoogleModels,
}: {
  googleApiKey: string | null | undefined;
  enabledGoogleModels: unknown;
}): UserAiSettings => ({
  hasGoogleApiKey: Boolean(googleApiKey?.trim()),
  enabledModelIds: resolveEnabledWireModels(enabledGoogleModels),
});

export const upsertUserByAuthSub = async ({
  authSub,
  email,
  name,
  avatarUrl,
}: UpsertUserInput) => {
  const db = getDb();

  await db
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
    });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.authSub, authSub))
    .limit(1);

  return user ?? null;
};

export const getUserAiSettings = async (
  userId: string,
): Promise<UserAiSettings | null> => {
  const db = getDb();

  const [user] = await db
    .select({
      googleApiKey: users.googleApiKey,
      enabledGoogleModels: users.enabledGoogleModels,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  return toPublicUserAiSettings({
    googleApiKey: user.googleApiKey,
    enabledGoogleModels: user.enabledGoogleModels,
  });
};

export const getUserAiSettingsForGeneration = async (
  userId: string,
): Promise<UserAiSettingsForGeneration | null> => {
  const db = getDb();

  const [user] = await db
    .select({
      googleApiKey: users.googleApiKey,
      enabledGoogleModels: users.enabledGoogleModels,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  return {
    googleApiKey: user.googleApiKey?.trim() || null,
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

  if (clearGoogleApiKey) {
    setPayload.googleApiKey = null;
  } else if (googleApiKey !== undefined) {
    setPayload.googleApiKey = googleApiKey.trim();
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
