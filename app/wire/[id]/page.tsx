import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { DEFAULT_WIRE_MODEL, resolveRunnableWireModel } from "@/lib/wireModels";
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

  const projectDetail = await getProjectDetailForUser(
    resolvedParams.id,
    sessionUser.id,
  );

  if (!projectDetail) {
    notFound();
  }

  const initialPages =
    projectDetail.pages.length > 0
      ? projectDetail.pages.map((page) => ({
          id: page.id,
          title: page.title,
          pageHtml: page.htmlContent,
          deviceType:
            page.deviceType === "mobile" ? ("mobile" as const) : ("desktop" as const),
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
