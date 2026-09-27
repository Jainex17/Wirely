import type { Metadata } from "next";
import { headers } from "next/headers";
import { listApiTokens } from "@/lib/auth/apiToken";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { listProjectsForUser } from "@/lib/db/queries/projects";
import HomeClient from "./HomeClient";
import Landing from "./Landing";

export const metadata: Metadata = {
  title: "Wirely",
  description: "The design canvas for your coding agent.",
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
    // The install command on the landing page names this deployment's MCP URL.
    const requestHeaders = await headers();
    const host = requestHeaders.get("host") ?? "localhost:3000";
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
    return <Landing origin={`${protocol}://${host}`} />;
  }

  const [projects, agentTokens] = await Promise.all([
    listProjectsForUser(session.user.id),
    listApiTokens(session.user.id),
  ]);

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
        hasGoogleApiKey: session.aiSettings.hasGoogleApiKey,
        hasOpenRouterApiKey: session.aiSettings.hasOpenRouterApiKey,
        hasZaiApiKey: session.aiSettings.hasZaiApiKey,
        hasConnectedAgent: agentTokens.some((token) => token.lastUsedAt !== null),
      }}
    />
  );
}
