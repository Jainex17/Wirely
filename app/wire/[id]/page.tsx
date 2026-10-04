import type { Metadata } from "next";
import { isPageDeviceType } from "@/lib/types";
import { notFound, redirect } from "next/navigation";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { DEFAULT_WIRE_MODEL, resolveRunnableWireModel, WIRE_MODEL_OPTIONS } from "@/lib/wireModels";
import DesignEditor from "@/components/design/DesignEditorLoader";
import WireEditor from "./WireEditor";

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
  const projectDetail = await getProjectDetailForUser(
    resolvedParams.id,
    sessionUser.id,
  );

  if (!projectDetail) {
    notFound();
  }

  if (projectDetail.project.kind === "design") {
    // The models in-app generation can run: enabled, with their provider's key saved.
    const keyPresence = {
      google: aiSettings.hasGoogleApiKey,
      openrouter: aiSettings.hasOpenRouterApiKey,
      zai: aiSettings.hasZaiApiKey,
    };
    const models = WIRE_MODEL_OPTIONS.filter(
      (option) => aiSettings.enabledModelIds.includes(option.id) && keyPresence[option.provider],
    ).map((option) => ({ id: option.id, label: option.label, tier: option.tier }));
    return (
      <DesignEditor
        projectId={resolvedParams.id}
        projectTitle={projectDetail.project.title}
        models={models}
        initialMessages={projectDetail.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        }))}
      />
    );
  }

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
    resolveRunnableWireModel(aiSettings.enabledModelIds, {
      google: aiSettings.hasGoogleApiKey,
      openrouter: aiSettings.hasOpenRouterApiKey,
      zai: aiSettings.hasZaiApiKey,
    }) ?? DEFAULT_WIRE_MODEL;

  return (
    <WireEditor
      wireId={resolvedParams.id}
      sessionUser={{
        name: sessionUser.name,
        email: sessionUser.email,
        avatarUrl: sessionUser.avatarUrl,
      }}
      initialProject={{
        projectTitle,
        pages: initialPages,
      }}
      pagesLoadedAt={pagesLoadedAt}
      initialModelName={initialModelName}
      initialMessages={projectDetail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        planningSummary: message.planningSummary,
        selectedModelName: message.selectedModelName,
        plannerModelName: message.plannerModelName,
        criticModelName: message.criticModelName,
      }))}
    />
  );
}
