import type { Metadata } from "next";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { listProjectsForUser } from "@/lib/db/queries/projects";
import HomeClient from "./HomeClient";
import Landing from "./Landing";

export const metadata: Metadata = {
  title: "Wirely",
  description: "Turn a prompt into editable web pages you own.",
};

const MAX_DRAFT_PROMPT_LENGTH = 500;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const [{ prompt }, session] = await Promise.all([
    searchParams,
    getServerSessionUserWithAiSettings(),
  ]);

  if (!session) {
    return <Landing />;
  }

  const projects = await listProjectsForUser(session.user.id);

  const draftPrompt =
    typeof prompt === "string" ? prompt.slice(0, MAX_DRAFT_PROMPT_LENGTH) : "";

  return (
    <HomeClient
      initialData={{
        user: session.user,
        historyItems: projects.map((project) => ({
          id: project.id,
          title: project.title,
          status: project.status,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        })),
        historyTotal: projects[0]?.totalActive ?? 0,
        initialPrompt: draftPrompt,
        enabledModelIds: session.aiSettings.enabledModelIds,
        customLocalModelIds: session.aiSettings.customLocalModelIds,
        discoveredLocalModelIds: session.aiSettings.discoveredLocalModelIds,
        hasGoogleApiKey: session.aiSettings.hasGoogleApiKey,
        hasOpenRouterApiKey: session.aiSettings.hasOpenRouterApiKey,
        hasZaiApiKey: session.aiSettings.hasZaiApiKey,
      }}
    />
  );
}
