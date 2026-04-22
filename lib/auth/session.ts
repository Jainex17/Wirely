import { getUserByAuthSub, upsertUserByAuthSub } from "@/lib/db/queries/users";
import { auth, currentUser } from "@clerk/nextjs/server";

export interface SessionUser {
  id: string;
  authSub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const authUserToSessionUser = async ({
  authSub,
  email,
  name,
  avatarUrl,
}: {
  authSub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}): Promise<SessionUser | null> => {
  const existingUser = await getUserByAuthSub(authSub);
  const nameToPersist = existingUser?.name ?? name;
  const shouldUpsert =
    !existingUser ||
    existingUser.email !== email ||
    existingUser.avatarUrl !== avatarUrl ||
    existingUser.name !== nameToPersist;

  const user = shouldUpsert
    ? await upsertUserByAuthSub({
        authSub,
        email,
        name: nameToPersist,
        avatarUrl,
      })
    : existingUser;

  if (!user) return null;

  return {
    id: user.id,
    authSub: user.authSub,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
};

const getSessionUserFromClerk = async (): Promise<SessionUser | null> => {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const claims = sessionClaims;

  let email = toStringOrNull(claims?.email);
  let name = toStringOrNull(claims?.name);
  let avatarUrl = toStringOrNull(claims?.image_url ?? claims?.picture);

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

  return authUserToSessionUser({
    authSub: userId,
    email,
    name,
    avatarUrl,
  });
};

export const getRequestSessionUser = async (): Promise<SessionUser | null> =>
  getSessionUserFromClerk();

export const getServerSessionUser = async (): Promise<SessionUser | null> =>
  getSessionUserFromClerk();
