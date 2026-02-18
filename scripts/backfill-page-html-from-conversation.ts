import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  conversationMessages,
  conversations,
  projectPages,
  projects,
} from "@/lib/db/schema";
import { parseBatchWireOutput, parseWireOutput } from "@/app/lib/wireOutput";

const run = async () => {
  const db = getDb();

  const allProjects = await db.select({ id: projects.id }).from(projects);

  let projectsScanned = 0;
  let pagesUpdated = 0;
  let projectsUpdated = 0;

  for (const project of allProjects) {
    projectsScanned += 1;

    const pages = await db
      .select({
        id: projectPages.id,
        sortOrder: projectPages.sortOrder,
        htmlContent: projectPages.htmlContent,
      })
      .from(projectPages)
      .where(eq(projectPages.projectId, project.id))
      .orderBy(projectPages.sortOrder);

    if (pages.length === 0) continue;
    if (pages.some((page) => page.htmlContent.trim().length > 0)) {
      continue;
    }

    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.projectId, project.id))
      .limit(1);

    if (!conversation) continue;

    const [latestAssistant] = await db
      .select({ content: conversationMessages.content })
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.conversationId, conversation.id),
          eq(conversationMessages.role, "assistant"),
        ),
      )
      .orderBy(desc(conversationMessages.createdAt))
      .limit(1);

    if (!latestAssistant?.content?.trim()) continue;

    const parsedBatch = parseBatchWireOutput(latestAssistant.content, pages.length);
    const batchCandidates = parsedBatch.htmlByIndex.filter(
      (candidate) => candidate.trim().length > 0,
    );
    const htmlCandidates =
      batchCandidates.length > 0
        ? parsedBatch.htmlByIndex
        : [parseWireOutput(latestAssistant.content).html];

    let updatedThisProject = 0;

    for (let index = 0; index < pages.length; index += 1) {
      const candidate = htmlCandidates[index] ?? "";
      if (!candidate.trim()) continue;

      const [updated] = await db
        .update(projectPages)
        .set({
          htmlContent: candidate,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectPages.projectId, project.id),
            eq(projectPages.id, pages[index].id),
          ),
        )
        .returning({ id: projectPages.id });

      if (updated) {
        updatedThisProject += 1;
      }
    }

    if (updatedThisProject > 0) {
      pagesUpdated += updatedThisProject;
      projectsUpdated += 1;
    }
  }

  console.info("[backfill-page-html] complete", {
    projectsScanned,
    projectsUpdated,
    pagesUpdated,
  });
};

run().catch((error) => {
  console.error("[backfill-page-html] failed", error);
  process.exitCode = 1;
});
