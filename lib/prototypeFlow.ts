/**
 * Rules for a project's prototype flow, shared by the editor's save route and
 * the MCP `set_prototype_flow` tool, plus the navigation check an agent gets
 * back after it links screens into a flow, and the element links the play
 * view follows on click.
 */
import {
  findNodeSpan,
  getNodeHtml,
  readNodeId,
  removeNodeAttribute,
  scanTags,
  setNodeAttribute,
  stampNodeIds,
} from "@/lib/pageNodes";

export const MAX_FLOW_PAGE_COUNT = 50;

export type FlowInput =
  | { ok: true; pageIds: string[]; startPageId: string | null }
  | { ok: false; error: string };

export const parseFlowInput = (pageIds: unknown, startPageId: unknown): FlowInput => {
  if (
    !Array.isArray(pageIds) ||
    pageIds.length === 0 ||
    pageIds.length > MAX_FLOW_PAGE_COUNT ||
    pageIds.some((pageId) => typeof pageId !== "string" || pageId.trim().length === 0)
  ) {
    return {
      ok: false,
      error: `pageIds must be a non-empty array of page ids with at most ${MAX_FLOW_PAGE_COUNT} entries.`,
    };
  }
  if (new Set(pageIds).size !== pageIds.length) {
    return { ok: false, error: "pageIds must not contain duplicates." };
  }
  const start =
    typeof startPageId === "string" && startPageId.trim().length > 0 ? startPageId : null;
  if (start !== null && !pageIds.includes(start)) {
    return { ok: false, error: "startPageId must be one of pageIds." };
  }
  return { ok: true, pageIds: pageIds as string[], startPageId: start };
};

const decodeText = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The link labels in a page's first <nav>, or its first <header> when it has
 * no <nav>. Null when it has neither.
 */
export const readNavigationLabels = (html: string): string[] | null => {
  const block =
    /<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/i.exec(html) ??
    /<header\b[^>]*>([\s\S]*?)<\/header\s*>/i.exec(html);
  if (!block) return null;
  return [...block[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)]
    .map((match) => decodeText(match[1]))
    .filter(Boolean);
};

const MAX_LISTED_LABELS = 8;

const listLabels = (labels: string[] | null) =>
  labels === null
    ? "no <nav> or <header>"
    : labels.length === 0
      ? "a nav with no links"
      : labels.slice(0, MAX_LISTED_LABELS).join(", ") +
        (labels.length > MAX_LISTED_LABELS ? ", ..." : "");

/**
 * One line per screen whose navigation differs from what most screens of the
 * same device type use. Desktop and mobile are compared apart, since a mobile
 * menu legitimately differs, and artboards have no navigation.
 */
export const findNavigationMismatches = (
  pages: ReadonlyArray<{ title: string; deviceType: string; html: string }>,
): string[] => {
  const lines: string[] = [];
  for (const deviceType of ["desktop", "mobile"]) {
    const group = pages
      .filter((page) => page.deviceType === deviceType)
      .map((page) => ({ title: page.title, labels: readNavigationLabels(page.html) }));
    if (group.length < 2 || group.every((page) => page.labels === null)) continue;

    const keyOf = (labels: string[] | null) => JSON.stringify(labels);
    const counts = new Map<string, number>();
    for (const page of group) counts.set(keyOf(page.labels), (counts.get(keyOf(page.labels)) ?? 0) + 1);
    // Ties go to the first screen in the flow, which is usually the one the rest copy.
    const [commonKey, commonCount] = [...counts].reduce((best, entry) =>
      entry[1] > best[1] ? entry : best,
    );
    const common = group.find((page) => keyOf(page.labels) === commonKey)?.labels ?? null;

    for (const page of group) {
      if (keyOf(page.labels) === commonKey) continue;
      lines.push(
        `"${page.title}" (${deviceType}) has ${listLabels(page.labels)}; ${commonCount} other ` +
          `screen${commonCount === 1 ? "" : "s"} use ${listLabels(common)}.`,
      );
    }
  }
  return lines;
};

/**
 * Marks an element as a hotspot: in the play view a click on it opens the page
 * whose id it holds. The link lives on the element, so it moves, copies, and
 * deletes with it, and `stripWirelyArtifacts` drops it and the link attributes
 * below from exported HTML.
 */
export const PAGE_LINK_ATTRIBUTE = "data-wirely-goto";

/** How the play view moves to the hotspot's page. No attribute means instant. */
export const PAGE_TRANSITION_ATTRIBUTE = "data-wirely-transition";
export const PAGE_TRANSITIONS = ["instant", "dissolve", "slide-left", "slide-right"] as const;
export type PageTransition = (typeof PAGE_TRANSITIONS)[number];

/** A transition name read from an attribute or a message, or instant for anything else. */
export const parsePageTransition = (value: unknown): PageTransition =>
  PAGE_TRANSITIONS.find((transition) => transition === value) ?? "instant";

const readAttribute = (attributes: string, name: string) => {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attributes);
  return match ? (match[1] ?? match[2]) : undefined;
};

export interface PageLink {
  nodeId: string;
  targetPageId: string;
  transition: PageTransition;
  /** The element's visible text, cut short, so an agent can tell links apart. */
  label: string;
}

const MAX_LINK_LABEL_CHARS = 40;

const linkLabel = (html: string, nodeId: string) => {
  const text = decodeText(getNodeHtml(html, nodeId) ?? "");
  return text.length > MAX_LINK_LABEL_CHARS ? `${text.slice(0, MAX_LINK_LABEL_CHARS - 3)}...` : text;
};

/** Every hotspot on a page, in document order. */
export const readPageLinks = (html: string): PageLink[] => {
  const links: PageLink[] = [];
  for (const tag of scanTags(html)) {
    if (tag.isClosing) continue;
    const nodeId = readNodeId(tag.attributes);
    if (!nodeId) continue;
    const targetPageId = readAttribute(tag.attributes, PAGE_LINK_ATTRIBUTE);
    if (!targetPageId) continue;
    links.push({
      nodeId,
      targetPageId,
      transition: parsePageTransition(readAttribute(tag.attributes, PAGE_TRANSITION_ATTRIBUTE)),
      label: linkLabel(html, nodeId),
    });
  }
  return links;
};

export interface PageLinkOptions {
  transition?: PageTransition;
}

/**
 * Points the element at `targetPageId` with the given options, or removes its
 * link when the target is null. A default option writes no attribute. Stamps
 * ids first so a node id from get_page_outline resolves. Null when the element
 * is not on the page.
 */
export const setPageLink = (
  html: string,
  nodeId: string,
  targetPageId: string | null,
  { transition = "instant" }: PageLinkOptions = {},
) => {
  const source = stampNodeIds(html);
  if (!findNodeSpan(source, nodeId)) return null;
  const write = (current: string, name: string, value: string | null) =>
    (value === null
      ? removeNodeAttribute(current, nodeId, name)
      : setNodeAttribute(current, nodeId, name, value)) ?? current;
  const linked = write(source, PAGE_LINK_ATTRIBUTE, targetPageId);
  return write(
    linked,
    PAGE_TRANSITION_ATTRIBUTE,
    targetPageId === null || transition === "instant" ? null : transition,
  );
};

/** The messages the play script posts out of the frame: a hotspot click and an arrow key. */
export const PLAY_GOTO_MESSAGE = "wirely-play-goto";
export const PLAY_KEY_MESSAGE = "wirely-prototype-key";

/**
 * The script the play view adds to each srcdoc, after sanitizing. The frame is
 * sandboxed without allow-same-origin, so the viewer cannot read clicks in it.
 * The script reports a hotspot click and arrow keys out by message. Only a
 * hotspot responds to a click, as in Figma: every other click is cancelled in
 * the capture phase before the page's own links, buttons, and handlers see it,
 * and it flashes the hotspots so the user sees where they can click. It goes in
 * right after the CSP meta tag, ahead of every page script, so its window
 * listeners run first and can stop the page's own. The viewer only ever moves
 * to a page it already holds, so a forged message from the page's own scripts
 * can do no more than a click.
 */
export const addPlayScript = (html: string) => {
  if (!html) return html;
  const attr = JSON.stringify(PAGE_LINK_ATTRIBUTE);
  const transitionAttr = JSON.stringify(PAGE_TRANSITION_ATTRIBUTE);
  const script =
    `<script>(function(){var A=${attr},T=${transitionAttr},S="["+A+"]";` +
    `var style=document.createElement("style");style.textContent=S+"{cursor:pointer!important}"+` +
    `"html.wirely-hint "+S+"{outline:2px solid rgba(13,153,255,.9)!important;outline-offset:0!important;box-shadow:inset 0 0 0 9999px rgba(13,153,255,.25)!important}";` +
    `(document.head||document.documentElement).appendChild(style);var timer=0;` +
    `var hotspotOf=function(event){var el=event.target instanceof Element?event.target:null;return el&&el.closest(S);};` +
    `["pointerdown","mousedown","touchstart"].forEach(function(type){window.addEventListener(type,function(event){` +
    `if(!hotspotOf(event))event.stopImmediatePropagation();},true);});` +
    `window.addEventListener("click",function(event){var hotspot=hotspotOf(event);event.preventDefault();event.stopImmediatePropagation();` +
    `if(hotspot){parent.postMessage({type:${JSON.stringify(PLAY_GOTO_MESSAGE)},pageId:hotspot.getAttribute(A),transition:hotspot.getAttribute(T)},"*");return;}` +
    `if(!document.querySelector(S))return;var root=document.documentElement;root.classList.add("wirely-hint");` +
    `clearTimeout(timer);timer=setTimeout(function(){root.classList.remove("wirely-hint");},600);},true);` +
    `document.addEventListener("keydown",function(event){if(event.key==="ArrowLeft"||event.key==="ArrowRight"){` +
    `parent.postMessage({type:${JSON.stringify(PLAY_KEY_MESSAGE)},key:event.key},"*");}});})();</script>`;
  const anchor = /<meta\b[^>]*Content-Security-Policy[^>]*>/i.exec(html) ?? /<head\b[^>]*>/i.exec(html);
  if (!anchor) return `${script}${html}`;
  const at = anchor.index + anchor[0].length;
  return `${html.slice(0, at)}${script}${html.slice(at)}`;
};
