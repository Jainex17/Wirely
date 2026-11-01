/**
 * Prompts the Import dialog copies for sources only the user's agent can
 * reach: an app on their machine, their codebase, and Figma through the
 * agent's own Figma MCP. Each names the Wirely tool the agent should use, so
 * the result lands in this project.
 */
export type AgentImportSource = "live_app" | "codebase" | "figma";

export const buildAgentImportPrompt = (source: AgentImportSource, editorUrl: string, target: string) => {
  const link = target.trim();
  switch (source) {
    case "live_app":
      return (
        `Capture ${link || "http://localhost:3000"} from my running app into the Wirely project ` +
        `${editorUrl} with capture_local_page, and give me the link to the new page.`
      );
    case "codebase":
      return (
        `Read this codebase's routes and add its main screens to the Wirely project ${editorUrl}, ` +
        "one add_page per screen. Call get_memory first, set design tokens from the codebase " +
        "with set_design_tokens, and match each screen's real layout and copy."
      );
    case "figma":
      return (
        `Read ${link || "the Figma frame I am about to share"} with the Figma MCP and add it to the ` +
        `Wirely project ${editorUrl} as a page with add_page, matching its layout, type, and colors.`
      );
  }
};
