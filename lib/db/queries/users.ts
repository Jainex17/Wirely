import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export interface UpsertUserInput {
  authSub: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

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
