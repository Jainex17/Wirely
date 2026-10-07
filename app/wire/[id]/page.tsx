import type { Metadata } from "next";
import { isPageDeviceType } from "@/lib/types";
import { notFound, redirect } from "next/navigation";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { getProjectDocumentVersionForUser } from "@/lib/db/queries/projectDocuments";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { DEFAULT_WIRE_MODEL, resolveRunnableWireModel, WIRE_MODEL_OPTIONS } from "@/lib/wireModels";
import ProjectEditor from "./ProjectEditor";

export const metadata: Metadata = {
  title: "Editor | Wirely",
  description: "Edit and iterate on your Wirely project pages.",
};

interface WirePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}

export default async function WirePage({ params, searchParams }: WirePageProps) {
  const [resolvedParams, { view }] = await Promise.all([params, searchParams]);
  // Identity and AI settings share one users row, so read them together.
  const session = await getServerSessionUserWithAiSettings();
  if (!session) {
    redirect(`/login?next=/wire/${resolvedParams.id}`);
  }
  const { user: sessionUser, aiSettings } = session;

  // Taken before the read so a write that races the page load is still newer
  // than the editor's first change cursor.
  const pagesLoadedAt = new Date().toISOString();
  const [projectDetail, designVersion] = await Promise.all([
    getProjectDetailForUser(resolvedParams.id, sessionUser.id),
    getProjectDocumentVersionForUser(resolvedParams.id, sessionUser.id),
  ]);

  if (!projectDetail) {
    notFound();
  }

  // The models the Design tab's in-app generation can run: enabled, with
  // their provider's key saved.
  const keyPresence = {
    google: aiSettings.hasGoogleApiKey,
    openrouter: aiSettings.hasOpenRouterApiKey,
    zai: aiSettings.hasZaiApiKey,
  };
  const designModels = WIRE_MODEL_OPTIONS.filter(
    (option) => aiSettings.enabledModelIds.includes(option.id) && keyPresence[option.provider],
  ).map((option) => ({ id: option.id, label: option.label, tier: option.tier }));
  // A project used only on its Design tab, like one from before the tabs,
  // opens there — unless the URL names a tab, which is the user's last
  // explicit choice and wins over that default.
  const isDesignOnly =
    designVersion !== null && projectDetail.pages.every((page) => !page.htmlContent.trim());
  const initialView = view === "design" || (view !== "html" && isDesignOnly) ? "design" : "html";

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
      initialView={initialView}
      projectTitle={projectTitle}
      wire={{
        wireId: resolvedParams.id,
        sessionUser: {
          name: sessionUser.name,
          email: sessionUser.email,
          avatarUrl: sessionUser.avatarUrl,
        },
        initialProject: { projectTitle, pages: initialPages },
        pagesLoadedAt,
        initialModelName,
        initialMessages,
      }}
      design={{
        projectId: resolvedParams.id,
        models: designModels,
        initialMessages: initialMessages.map(({ id, role, content }) => ({ id, role, content })),
      }}
    />
  );
}
