import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { getUserAiSettingsForGeneration } from "@/lib/db/queries/users";
import { DEFAULT_WIRE_MODEL } from "@/lib/wireModels";
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
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect(`/login?next=/wire/${resolvedParams.id}`);
  }

  const [projectDetail, userAiSettings] = await Promise.all([
    getProjectDetailForUser(resolvedParams.id, sessionUser.id),
    getUserAiSettingsForGeneration(sessionUser.id),
  ]);

  if (!projectDetail) {
    notFound();
  }

  const initialPages =
    projectDetail.pages.length > 0
      ? projectDetail.pages.map((page) => ({
          id: page.id,
          title: page.title,
          pageHtml: page.htmlContent,
        }))
      : [
          {
            id: "page-home",
            title: "Page 1",
            pageHtml: "",
          },
        ];
  const projectTitle = projectDetail.project.title;
  const initialModelName = userAiSettings?.enabledModelIds[0] ?? DEFAULT_WIRE_MODEL;

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
