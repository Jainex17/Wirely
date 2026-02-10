import { notFound, redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { DEFAULT_WIRE_MODEL, isWireModelName } from "@/app/lib/wireModels";
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

  const latestVersion = projectDetail.versions[0];
  const initialPageHtml = latestVersion?.htmlContent ?? "";
  const initialPageTitle = projectDetail.pages[0]?.title ?? "Generated Page";
  const projectTitle = projectDetail.project.title;
  const initialModelName = isWireModelName(latestVersion?.modelName)
    ? latestVersion.modelName
    : DEFAULT_WIRE_MODEL;

  return (
    <WireEditor
      wireId={resolvedParams.id}
      sessionUser={{
        name: sessionUser.name,
        email: sessionUser.email,
      }}
      initialProject={{
        pageId: projectDetail.pages[0]?.id ?? "page-home",
        pageTitle: initialPageTitle,
        projectTitle,
        pageHtml: initialPageHtml,
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
