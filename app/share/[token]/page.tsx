import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ShareViewer from "@/components/ShareViewer";
import { getServerSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { getSharedProjectByToken, listProjectComments } from "@/lib/db/queries/reviews";

export const metadata: Metadata = {
  title: "Review | Wirely",
  description: "Review the pages of a Wirely project and leave comments.",
  // A review link is a capability. Keep it out of search results and previews.
  robots: { index: false, follow: false },
};

interface SharePageProps {
  params: Promise<{ token: string }>;
}

const loadSharedProject = async (token: string) => {
  try {
    const shared = await getSharedProjectByToken(token);
    if (!shared) return null;
    return { ...shared, comments: await listProjectComments(shared.project.id) };
  } catch (error) {
    // Before the review migration runs, every link is dead.
    if (isMissingRelationError(error)) return null;
    throw error;
  }
};

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect(`/login?next=/share/${encodeURIComponent(token)}`);
  }

  const shared = await loadSharedProject(token);
  if (!shared || shared.pages.length === 0) notFound();

  return (
    <ShareViewer
      token={token}
      projectId={shared.project.id}
      projectTitle={shared.project.title}
      pages={shared.pages.map((page) => ({
        id: page.id,
        title: page.title,
        html: page.htmlContent,
        deviceType: page.deviceType === "mobile" ? "mobile" : "desktop",
      }))}
      initialComments={shared.comments}
      currentUserId={sessionUser.id}
      isOwner={shared.project.ownerUserId === sessionUser.id}
    />
  );
}
