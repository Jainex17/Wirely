/**
 * A project's title is also how the user names it to an agent, which finds
 * it with list_projects. Shared by the rename route and the two rename fields.
 */
export const PROJECT_TITLE_MAX_CHARS = 120;

/** The trimmed title with inner runs of whitespace collapsed, or null when empty or too long. */
export const parseProjectTitle = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  return title.length >= 1 && title.length <= PROJECT_TITLE_MAX_CHARS ? title : null;
};

/** Saves a new title and returns the one the server stored. Throws with a message to show. */
export const saveProjectTitle = async (projectId: string, title: string) => {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    project?: { title?: string };
  };
  if (!response.ok || !payload.project?.title) {
    throw new Error(payload.error ?? "Could not rename the project.");
  }
  return payload.project.title;
};
