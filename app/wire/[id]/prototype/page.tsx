import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import { getProjectDetailForUser } from "@/lib/db/queries/projects";
import { getPrototypeFlowForProject } from "@/lib/db/queries/prototypeFlows";
import PrototypeViewer from "@/components/PrototypeViewer";

interface WirePrototypePageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Prototype | Wirely",
  description: "View the clickable prototype flow for this Wirely project.",
};

export default async function WirePrototypePage({
  params,
}: WirePrototypePageProps) {
  const resolvedParams = await params;
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect(`/login?next=/wire/${resolvedParams.id}/prototype`);
  }

  const [projectDetail, flow] = await Promise.all([
    getProjectDetailForUser(resolvedParams.id, sessionUser.id),
    getPrototypeFlowForProject(resolvedParams.id, sessionUser.id),
  ]);

  if (!projectDetail || !flow || flow.pageIds.length === 0) {
    notFound();
  }

  const pageById = new Map(
    projectDetail.pages.map((page) => [
      page.id,
      {
        id: page.id,
        title: page.title,
        html: page.htmlContent,
        deviceType:
          page.deviceType === "mobile" ? ("mobile" as const) : ("desktop" as const),
      },
    ]),
  );

  const flowPages = flow.pageIds
    .map((pageId) => pageById.get(pageId))
    .filter((page): page is NonNullable<ReturnType<typeof pageById.get>> =>
      Boolean(page),
    );

  if (flowPages.length === 0) {
    notFound();
  }

  const startPageIndex = Math.max(
    0,
    flowPages.findIndex((page) => page.id === flow.startPageId),
  );

  return (
    <PrototypeViewer
      wireId={resolvedParams.id}
      projectTitle={projectDetail.project.title}
      pages={flowPages}
      initialPageIndex={startPageIndex}
    />
  );
}
