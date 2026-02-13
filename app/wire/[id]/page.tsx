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
  const latestVersionByPageId = new Map<string, (typeof projectDetail.versions)[number]>();
  for (const version of projectDetail.versions) {
    if (!latestVersionByPageId.has(version.pageId)) {
      latestVersionByPageId.set(version.pageId, version);
    }
  }

  const initialPages =
    projectDetail.pages.length > 0
      ? projectDetail.pages.map((page) => ({
          id: page.id,
          title: page.title,
          pageHtml: latestVersionByPageId.get(page.id)?.htmlContent ?? "",
        }))
      : [
          {
            id: "page-home",
            title: "Generated Page",
            pageHtml: "",
          },
        ];
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
