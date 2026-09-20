import {
  getUserByAuthSub,
  getUserWithAiSettingsByAuthSub,
  upsertUserByAuthSub,
  type UserAiSettings,
} from "@/lib/db/queries/users";
import { auth, currentUser } from "@clerk/nextjs/server";

export interface SessionUser {
  id: string;
  authSub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface SessionUserWithAiSettings {
  user: SessionUser;
  aiSettings: UserAiSettings;
}

type ClerkSessionClaims = Awaited<ReturnType<typeof auth>>["sessionClaims"];

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const toSessionUser = (user: {
  id: string;
  authSub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}): SessionUser => ({
  id: user.id,
  authSub: user.authSub,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
});

// Runs only when no users row exists for this auth subject yet, i.e. the first
// request after sign-in (or after the row was removed). It may pay for one
// Clerk profile fetch plus one upsert; every later request takes the read
// path instead of re-syncing the Clerk profile on each visit.
const syncSessionUserFromClerk = async ({
  authSub,
  sessionClaims,
}: {
  authSub: string;
  sessionClaims: ClerkSessionClaims;
}): Promise<SessionUser | null> => {
  let email = toStringOrNull(sessionClaims?.email);
  let name = toStringOrNull(sessionClaims?.name);
  let avatarUrl = toStringOrNull(sessionClaims?.image_url ?? sessionClaims?.picture);

  if (!email || !name || !avatarUrl) {
    const user = await currentUser();
    if (user) {
      const derivedFullName =
        user.fullName ?? [user.firstName, user.lastName].filter(Boolean).join(" ");

      email = email ?? user.primaryEmailAddress?.emailAddress ?? null;
      name = name ?? (derivedFullName || user.username || null);
      avatarUrl = avatarUrl ?? user.imageUrl ?? null;
    }
  }

  const user = await upsertUserByAuthSub({ authSub, email, name, avatarUrl });
  return user ? toSessionUser(user) : null;
};

const getSessionUserFromClerk = async (): Promise<SessionUser | null> => {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const existingUser = await getUserByAuthSub(userId);
  if (existingUser) return toSessionUser(existingUser);

  return syncSessionUserFromClerk({ authSub: userId, sessionClaims });
};

export const getRequestSessionUser = async (): Promise<SessionUser | null> =>
  getSessionUserFromClerk();

export const getServerSessionUser = async (): Promise<SessionUser | null> =>
  getSessionUserFromClerk();

// Resolves the session user and their AI settings from a single users-row
// read. Used by pages that need both, so they pay two database round trips
// total (this plus their data query) instead of three.
export const getServerSessionUserWithAiSettings =
  async (): Promise<SessionUserWithAiSettings | null> => {
    const { userId, sessionClaims } = await auth();
    if (!userId) return null;

    const existing = await getUserWithAiSettingsByAuthSub(userId);
    if (existing) {
      return { user: toSessionUser(existing.user), aiSettings: existing.aiSettings };
    }

    const user = await syncSessionUserFromClerk({ authSub: userId, sessionClaims });
    if (!user) return null;

    const synced = await getUserWithAiSettingsByAuthSub(user.authSub);
    return synced
      ? { user: toSessionUser(synced.user), aiSettings: synced.aiSettings }
      : null;
  };
