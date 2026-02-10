import { upsertUserByAuthSub } from "@/lib/db/queries/users";
import { auth } from "@/lib/auth/server";

export interface SessionUser {
  id: string;
  authSub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

const authUserToSessionUser = async (authUser: {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): Promise<SessionUser | null> => {
  const authSub = typeof authUser.id === "string" ? authUser.id : null;
  if (!authSub) return null;

  const email = typeof authUser.email === "string" ? authUser.email : null;
  const name = typeof authUser.name === "string" ? authUser.name : null;
  const avatarUrl = typeof authUser.image === "string" ? authUser.image : null;

  const user = await upsertUserByAuthSub({ authSub, email, name, avatarUrl });
  if (!user) return null;

  return {
    id: user.id,
    authSub: user.authSub,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
};

export const getRequestSessionUser = async (): Promise<SessionUser | null> => {
  const { data } = await auth.getSession();
  if (!data?.user) return null;
  return authUserToSessionUser(data.user);
};

export const getServerSessionUser = async (): Promise<SessionUser | null> => {
  const { data } = await auth.getSession();
  if (!data?.user) return null;
  return authUserToSessionUser(data.user);
};
