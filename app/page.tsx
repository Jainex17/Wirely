import type { Metadata } from "next";
import { getServerSessionUser } from "@/lib/auth/session";
import { listProjectsForUser } from "@/lib/db/queries/projects";
import { getUserAiSettings } from "@/lib/db/queries/users";
import { DEFAULT_ENABLED_WIRE_MODELS } from "@/lib/wireModels";
import HomeClient, { type HomeClientInitialData } from "./HomeClient";

export const metadata: Metadata = {
  title: "Wirely",
  description: "Create and manage AI-generated web projects in Wirely.",
};

const getHomeInitialData = async (): Promise<HomeClientInitialData> => {
  const sessionUser = await getServerSessionUser();

  if (!sessionUser) {
    return {
      user: null,
      historyItems: [],
      enabledModelIds: [...DEFAULT_ENABLED_WIRE_MODELS],
      hasGoogleApiKey: true,
    };
  }

  const [projects, aiSettings] = await Promise.all([
    listProjectsForUser(sessionUser.id),
    getUserAiSettings(sessionUser.id),
  ]);

  return {
    user: {
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      avatarUrl: sessionUser.avatarUrl,
    },
    historyItems: projects,
    enabledModelIds: aiSettings?.enabledModelIds ?? [...DEFAULT_ENABLED_WIRE_MODELS],
    hasGoogleApiKey: aiSettings?.hasGoogleApiKey ?? true,
  };
};

export default async function Home() {
  const initialData = await getHomeInitialData();
  return <HomeClient initialData={initialData} />;
}
