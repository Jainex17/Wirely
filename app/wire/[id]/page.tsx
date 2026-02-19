import { notFound, redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { getUserAiSettingsForGeneration } from "@/lib/db/queries/users";
import { DEFAULT_WIRE_MODEL } from "@/lib/wireModels";
import WireEditor from "./WireEditor";

interface WirePageProps {
  params: Promise<{ id: string }>;
}

export default async function WirePage({ params }: WirePageProps) {
  const resolvedParams = await params;
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect(`/login?next=/wire/${resolvedParams.id}`);
  }

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
        }))
      : [
          {
            id: "page-home",
            title: "Page 1",
            pageHtml: "",
          },
        ];
  const projectTitle = projectDetail.project.title;
  const userAiSettings = await getUserAiSettingsForGeneration(sessionUser.id);
  const initialModelName = userAiSettings?.enabledModelIds[0] ?? DEFAULT_WIRE_MODEL;

  return (
    <WireEditor
      wireId={resolvedParams.id}
      sessionUser={{
        name: sessionUser.name,
        email: sessionUser.email,
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
      }))}
    />
  );
}
