import type { DesignTokens } from "@/lib/designTokens";

/**
 * A project's memory: what the product is, and the style rules every agent
 * follows when it designs here. The user writes it in the editor's Memory tab
 * and agents read it with the get_memory MCP tool, together with the design
 * tokens, before they write pages.
 */
export interface ProjectMemory {
  context: string;
  rules: string[];
}

export const MAX_CONTEXT_CHARS = 4000;
export const MAX_RULES = 50;
export const MAX_RULE_CHARS = 500;

export type MemoryParseResult = { ok: true; memory: ProjectMemory } | { ok: false; error: string };

/** Validates a request body. Trims text and drops blank rules. */
export const parseProjectMemory = (value: unknown): MemoryParseResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Memory must be an object with context and rules." };
  }
  const { context, rules } = value as { context?: unknown; rules?: unknown };
  if (typeof context !== "string") return { ok: false, error: "Context must be a string." };
  if (!Array.isArray(rules) || !rules.every((rule) => typeof rule === "string")) {
    return { ok: false, error: "Rules must be a list of strings." };
  }
  const trimmedContext = context.trim();
  if (trimmedContext.length > MAX_CONTEXT_CHARS) {
    return { ok: false, error: `Context can be at most ${MAX_CONTEXT_CHARS} characters.` };
  }
  const trimmedRules = rules.map((rule) => rule.trim()).filter(Boolean);
  if (trimmedRules.length > MAX_RULES) {
    return { ok: false, error: `At most ${MAX_RULES} rules are allowed.` };
  }
  if (trimmedRules.some((rule) => rule.length > MAX_RULE_CHARS)) {
    return { ok: false, error: `A rule can be at most ${MAX_RULE_CHARS} characters.` };
  }
  return { ok: true, memory: { context: trimmedContext, rules: trimmedRules } };
};

/**
 * Applies a set_memory call to the stored memory. A field the agent left out
 * keeps its current value, so an agent can add a rule without resending the
 * context. Validates the result the same way the editor's save does.
 */
export const mergeMemoryUpdate = (current: ProjectMemory, update: unknown): MemoryParseResult => {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    return { ok: false, error: "Send context, rules, or addRules." };
  }
  const { context, rules, addRules } = update as { context?: unknown; rules?: unknown; addRules?: unknown };
  if (context === undefined && rules === undefined && addRules === undefined) {
    return { ok: false, error: "Send context, rules, or addRules." };
  }
  if (rules !== undefined && addRules !== undefined) {
    return { ok: false, error: "Send rules to replace the list or addRules to extend it, not both." };
  }
  if (addRules !== undefined && (!Array.isArray(addRules) || !addRules.every((rule) => typeof rule === "string"))) {
    return { ok: false, error: "addRules must be a list of strings." };
  }
  const nextRules = addRules !== undefined ? [...current.rules, ...(addRules as string[])] : (rules ?? current.rules);
  return parseProjectMemory({ context: context ?? current.context, rules: nextRules });
};

/** The get_memory tool's reply: everything an agent should know before designing. */
export const formatMemoryForAgent = (
  projectTitle: string,
  memory: ProjectMemory,
  tokens: DesignTokens | null,
) => {
  const tokenEntries = Object.entries(tokens ?? {});
  if (!memory.context && memory.rules.length === 0 && tokenEntries.length === 0) {
    return (
      `"${projectTitle}" has no memory yet. Design from the user's request. The user adds ` +
      "context and rules in the editor's Memory tab."
    );
  }
  const sections = [`Memory for "${projectTitle}". Follow it in every page you write here.`];
  if (memory.context) sections.push(`Project context:\n${memory.context}`);
  if (memory.rules.length > 0) {
    sections.push(`Rules:\n${memory.rules.map((rule) => `- ${rule}`).join("\n")}`);
  }
  if (tokenEntries.length > 0) {
    sections.push(
      "Design tokens, already in every page. Use them as var(--name):\n" +
        tokenEntries.map(([name, value]) => `${name}: ${value}`).join("\n"),
    );
  }
  return sections.join("\n\n");
};
