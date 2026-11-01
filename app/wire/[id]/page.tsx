import type { Metadata } from "next";
import { isPageDeviceType } from "@/lib/types";
import { notFound, redirect } from "next/navigation";
import { listApiTokens } from "@/lib/auth/apiToken";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { DEFAULT_WIRE_MODEL, resolveRunnableWireModel } from "@/lib/wireModels";
import ProjectEditor from "./ProjectEditor";

export const metadata: Metadata = {
  title: "Editor | Wirely",
  description: "Edit and iterate on your Wirely project pages.",
};

interface WirePageProps {
  params: Promise<{ id: string }>;
}

export default async function WirePage({ params }: WirePageProps) {
  const resolvedParams = await params;
  // Identity and AI settings share one users row, so read them together.
  const session = await getServerSessionUserWithAiSettings();
  if (!session) {
    redirect(`/login?next=/wire/${resolvedParams.id}`);
  }
  const { user: sessionUser, aiSettings } = session;

  // Taken before the read so a write that races the page load is still newer
  // than the editor's first change cursor.
  const pagesLoadedAt = new Date().toISOString();
  const [projectDetail, agentTokens] = await Promise.all([
    getProjectDetailForUser(resolvedParams.id, sessionUser.id),
    listApiTokens(sessionUser.id),
  ]);

  if (!projectDetail) {
    notFound();
  }

  const keyPresence = {
    google: aiSettings.hasGoogleApiKey,
    openrouter: aiSettings.hasOpenRouterApiKey,
    zai: aiSettings.hasZaiApiKey,
  };

  const initialPages =
    projectDetail.pages.length > 0
      ? projectDetail.pages.map((page) => ({
          id: page.id,
          title: page.title,
          pageHtml: page.htmlContent,
          deviceType: isPageDeviceType(page.deviceType) ? page.deviceType : ("desktop" as const),
        }))
      : [
          {
            id: "page-home",
            title: "Page 1",
            pageHtml: "",
            deviceType: "desktop" as const,
          },
        ];
  const projectTitle = projectDetail.project.title;
  const initialModelName =
    resolveRunnableWireModel(aiSettings.enabledModelIds, keyPresence) ?? DEFAULT_WIRE_MODEL;

  const accountUser = {
    name: sessionUser.name,
    email: sessionUser.email,
    avatarUrl: sessionUser.avatarUrl,
  };

  const initialMessages = projectDetail.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    planningSummary: message.planningSummary,
    selectedModelName: message.selectedModelName,
    plannerModelName: message.plannerModelName,
    criticModelName: message.criticModelName,
  }));

  return (
    <ProjectEditor
      projectTitle={projectTitle}
      wire={{
        wireId: resolvedParams.id,
        sessionUser: accountUser,
        initialProject: { projectTitle, pages: initialPages },
        pagesLoadedAt,
        hasConnectedAgent: agentTokens.some((token) => token.lastUsedAt !== null),
        initialModelName,
        initialMessages,
      }}
    />
  );
}
