import { listApiTokens } from "@/lib/auth/apiToken";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { listProjectsForUser } from "@/lib/db/queries/projects";
import { redirect } from "next/navigation";
import HomeClient from "../HomeClient";

const MAX_DRAFT_PROMPT_LENGTH = 500;

/**
 * The signed-in home: the projects grid and the composer. Signed-out
 * visitors go through login and come back here.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const [{ prompt }, session] = await Promise.all([
    searchParams,
    getServerSessionUserWithAiSettings(),
  ]);

  if (!session) redirect("/login?next=/projects");

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
