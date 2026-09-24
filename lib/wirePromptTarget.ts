/**
 * Decides which pages a sidebar prompt runs against, from the prompt alone.
 *
 * There is no target picker, and asking a model would cost the user a call and
 * a delay on every run, so the rules are plain text checks in a fixed order:
 * explicit @mentions, then a new-screen request, then an all-pages request,
 * then the page the user last touched on the canvas.
 */
import type { PageIdentity, PageTitle } from "@/lib/types";

/** The hosted route rejects more than three target pages in one run. */
export const MAX_PROMPT_TARGET_PAGES = 3;

export type PromptTarget =
  | { kind: "page"; pageId: string }
  | { kind: "pages"; pageIds: string[]; droppedCount: number }
  | { kind: "new" }
  | { kind: "none" };

// Words that point at an existing thing rather than name a new screen, so
// "add a CTA to the page" and "make this page darker" do not create pages.
const NOT_A_SCREEN_NAME = "(?!(?:to|on|in|into|for|of|the|this|that|my|our|each|every|all)\\b)";

// A new screen needs an article or "new"/"another" before it, and must end the
// phrase. That keeps "add page numbers" and "add a page title" as edits.
const NEW_SCREEN_INTENT = new RegExp(
  "(?:\\b(?:add|create|make|build|design|generate)\\s+(?:(?:a|an|another|one\\s+more)\\s+)(?:new\\s+)?" +
    `(?:${NOT_A_SCREEN_NAME}[\\w-]+\\s+){0,2}` +
    "|^\\s*(?:a\\s+)?(?:new|another)\\s+)" +
    "(?:page|screen)" +
    "(?=\\s*(?:$|[.,;:!?]|(?:for|with|that|which|showing|where|to|about|listing|called|named|and)\\b))",
  "i",
);

const ALL_PAGES_INTENT = /\b(?:all|every|each)\s+(?:of\s+the\s+)?(?:pages?|screens?)\b/i;

export const hasNewScreenIntent = (prompt: string) => NEW_SCREEN_INTENT.test(prompt);

export const hasAllPagesIntent = (prompt: string) => ALL_PAGES_INTENT.test(prompt);

const toTarget = (pageIds: string[]): PromptTarget => {
  if (pageIds.length === 0) return { kind: "none" };
  if (pageIds.length === 1) return { kind: "page", pageId: pageIds[0] };
  return {
    kind: "pages",
    pageIds: pageIds.slice(0, MAX_PROMPT_TARGET_PAGES),
    droppedCount: Math.max(0, pageIds.length - MAX_PROMPT_TARGET_PAGES),
  };
};

export const inferPromptTarget = ({
  prompt,
  mentionedPageIds,
  pages,
  focusedPageId,
}: {
  prompt: string;
  mentionedPageIds: readonly string[];
  pages: readonly PageIdentity[];
  focusedPageId: string | null;
}): PromptTarget => {
  const pageIds = pages.map((page) => page.id);
  const mentioned = [...new Set(mentionedPageIds)].filter((id) => pageIds.includes(id));
  if (mentioned.length > 0) return toTarget(mentioned);

  if (hasNewScreenIntent(prompt)) return { kind: "new" };
  if (hasAllPagesIntent(prompt)) return toTarget(pageIds);

  if (focusedPageId && pageIds.includes(focusedPageId)) {
    return { kind: "page", pageId: focusedPageId };
  }
  return toTarget(pageIds.slice(0, 1));
};

/** A page picked from the @ popover, tracked by id so renames and duplicate titles work. */
export interface PromptMention {
  pageId: string;
  label: string;
}

export const mentionLabel = (page: PageTitle) => `@${page.title}`;

const countOccurrences = (text: string, needle: string) => {
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
    count += 1;
  }
  return count;
};

/**
 * Drops mentions whose text the user deleted. With two mentions sharing a
 * label and one copy of the text left, the earlier mention survives.
 */
export const pruneMentions = (prompt: string, mentions: readonly PromptMention[]) => {
  const remaining = new Map<string, number>();
  return mentions.filter((mention) => {
    const left = remaining.get(mention.label) ?? countOccurrences(prompt, mention.label);
    remaining.set(mention.label, left - 1);
    return left > 0;
  });
};

/**
 * The partial mention being typed at the caret, if any. An @ only starts a
 * mention at the start of the text or after whitespace, so an email address
 * never opens the page list.
 */
/**
 * Titles contain spaces, so the query runs to the caret. Text that already
 * holds a finished mention ("@Clack hero ") would still match its own page,
 * so it is skipped by passing the labels picked so far.
 */
export const findMentionQuery = (
  text: string,
  caret: number,
  pickedLabels: readonly string[] = [],
) => {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const fromAt = before.slice(at);
  if (pickedLabels.some((label) => fromAt.startsWith(`${label} `))) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n") || query.length > 40) return null;
  return { start: at, query };
};

export const filterMentionPages = <T extends PageTitle>(pages: readonly T[], query: string) => {
  const needle = query.trim().toLowerCase();
  return pages.filter((page) => page.title.toLowerCase().includes(needle)).slice(0, 8);
};
