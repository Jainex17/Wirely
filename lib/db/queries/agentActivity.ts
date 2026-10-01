import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projectAgentActivity } from "@/lib/db/schema";
import { isUuid } from "@/lib/projectComments";

/**
 * Records one MCP tool call. The insert selects from `projects` filtered by
 * owner, so an agent naming someone else's project id writes nothing.
 */
// ponytail: rows are never pruned, add a per-project cap if the table grows large.
export const recordAgentActivity = async (input: {
  userId: string;
  projectId: string;
  tool: string;
  pageId: string | null;
  error: string | null;
  detail: string | null;
}) => {
  if (!isUuid(input.projectId)) return;
  const pageId = input.pageId && isUuid(input.pageId) ? input.pageId : null;
  await getDb().execute(sql`
    insert into project_agent_activity (project_id, tool, page_id, error, detail)
    select id, ${input.tool}, ${pageId}::uuid, ${input.error}, ${input.detail}
    from projects
    where id = ${input.projectId}::uuid and user_id = ${input.userId}::uuid
  `);
};

/** The newest tool calls on a project, newest first. */
export const listAgentActivity = async (projectId: string, limit = 100) =>
  getDb()
    .select({
      id: projectAgentActivity.id,
      tool: projectAgentActivity.tool,
      pageId: projectAgentActivity.pageId,
      error: projectAgentActivity.error,
      detail: projectAgentActivity.detail,
      createdAt: projectAgentActivity.createdAt,
    })
    .from(projectAgentActivity)
    .where(eq(projectAgentActivity.projectId, projectId))
    .orderBy(desc(projectAgentActivity.createdAt))
    .limit(limit);
