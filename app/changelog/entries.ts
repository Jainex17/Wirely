export type ChangelogEntry = {
  /** The anchor id, also the month the entry covers. */
  id: string;
  month: string;
  title: string;
  intro: string;
  /** Describes the illustration for screen readers. */
  artLabel: string;
  /** Height of the phone-width image, which is 358 wide. The wide one is 720 by 400. */
  compactHeight: number;
  added: string[];
  fixed: string[];
};

/**
 * Every changelog entry, newest first, one per month of work. Each entry's
 * images are public/changelog/<id>-wide.webp and <id>-compact.webp.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-11",
    compactHeight: 440,
    month: "November 2026",
    title: "Memory, activity, and import",
    intro: "The editor has two new tabs and an import dialog, and every project is back to one canvas of HTML pages.",
    artLabel:
      "The editor's Memory tab with a project context, three style rules, and two design tokens, beside pages that follow those rules.",
    added: [
      "A Memory tab holds the project context, style rules, and design tokens. Every agent reads it before it writes a page, and an agent can add a rule with set_memory.",
      "An Activity tab lists the pages your agent added and edited, and new comments, in order.",
      "Import starts a page from a website, an HTML or SVG file, a live app on localhost, your repo's routes, or a Figma frame.",
      "An empty project shows a get started card with a first prompt you can copy.",
      "New sign-in and sign-up pages, an FAQ, docs pages, and a blog.",
    ],
    fixed: [
      "Removed the Editor tab and its design engine. Every page is HTML on one canvas.",
      "Square and circle tools replace the arrange and group tools.",
      "Pages can load https images from any host.",
      "Screenshot requests refuse private hosts.",
      "One lighter dark palette across the editor and every signed-in page.",
    ],
  },
  {
    id: "2026-10",
    compactHeight: 340,
    month: "October 2026",
    title: "Compare, play, and check your build",
    intro:
      "Pages became easier to judge side by side, to click through as a prototype, and to hold your real build against.",
    artLabel: "The compare dialog showing two layouts of a pricing page side by side.",
    added: [
      "Compare two pages side by side, overlaid, or as a difference where everything that matches turns black.",
      "Your agent can capture the page it built in your running app with capture_local_page and get back what differs from the design.",
      "Play mode. Agents link elements to pages with link_element, and a linked element can open a page as an overlay, slide or dissolve to it, or go back.",
      "Edit an element's play link, overlay, and transition from the inspector.",
      "Download pages as PNG at up to 3x and as PDF.",
      "A comment tool, snapping to nearby edges, and distances while Alt is held.",
      "Pages can import Paper Shaders.",
      "We tried an Editor tab with a node-based design canvas this month. We removed it in November.",
      "A new landing page. The signed-in home moved to /projects.",
      "Docs, privacy, and terms pages, and the MIT license.",
    ],
    fixed: [
      "The canvas draws off-screen pages as still previews and keeps one page live at a time, so large projects open fast.",
      "Agents reuse an existing project instead of creating one per chat, and list_projects can search titles.",
      "Server screenshots render in light mode, so a dark Mac no longer darkens them.",
      "Sign-in returns you to the page you opened.",
    ],
  },
  {
    id: "2026-09",
    compactHeight: 440,
    month: "September 2026",
    title: "Your coding agent draws on the canvas",
    intro:
      "Wirely became an MCP server. Claude Code, Cursor, Codex, and other clients write pages onto the canvas on the subscription you already pay for.",
    artLabel:
      "A terminal where a coding agent calls add_page and get_page_png, beside the canvas with the new pricing page selected.",
    added: [
      "An MCP server at /api/mcp, with one-click OAuth connect for MCP clients.",
      "Agent edits show up on the canvas live, even while you pan.",
      "Pick an element on the canvas and copy its link. Your agent edits that element and leaves the rest of the page alone.",
      "Drag, resize, and retype elements by hand, with frame, rectangle, and text tools, a layers panel, and undo.",
      "Agents can read a page's outline, edit one element, see what you changed by hand, and read your selection, page history, and design tokens.",
      "Review links where signed-in people pin comments on pages. Agents read them with list_comments.",
      "Vector pages with a pen tool for icons and illustrations.",
      "Page groups, and a prototype flow builder with its own preview.",
      "An Assets folder for each project that you and your agent upload images to.",
      "Live progress per page while a run generates, and desktop or mobile frames per page.",
      "A landing page, and settings gathered into tabs.",
    ],
    fixed: [
      "Removed the local agent. The MCP server does its job.",
      "The planner model picks the shape of each run, and quality scoring depends on what kind of page it is.",
      "Home shows your projects first, as a grid with live thumbnails.",
      "Gemini 3 models with 3.8 Flash as the default, and more free OpenRouter models.",
    ],
  },
  {
    id: "2026-04",
    compactHeight: 380,
    month: "April 2026",
    title: "Concepts and site pages",
    intro: "One prompt can now ask for different designs of one screen, or different screens of one site.",
    artLabel:
      "The editor sidebar with a plan for three concept variants and their status, beside the three pages on the canvas: one done, one half written, one queued.",
    added: [
      "Generation modes: a single page, concept variants of the same screen, or the pages of a site.",
      "Z.ai as a provider, for the free GLM Flash models.",
      "The sidebar shows the plan, its status while it runs, and the model that ran.",
    ],
    fixed: [
      "New pages land together, in view, without covering existing pages.",
      "A full README for the open source project.",
    ],
  },
  {
    id: "2026-03",
    compactHeight: 346,
    month: "March 2026",
    title: "Keys, images, and a canvas that remembers",
    intro:
      "Settings split into providers and models, generated pages gained images, and the canvas keeps its layout between visits.",
    artLabel:
      "The OpenRouter key dialog over the provider settings, with a masked key and a note that it is stored encrypted.",
    added: [
      "Separate Providers and Models settings pages, and a dialog to add or replace a key.",
      "Generated pages can include images.",
      "A page menu on the canvas, and edits aimed at one page or at every page.",
    ],
    fixed: [
      "A generating page shows a skeleton of its layout instead of a spinner.",
      "The canvas saves its layout in your browser and centers itself when you reload.",
      "Removed OpenCode Zen.",
    ],
  },
  {
    id: "2026-02",
    compactHeight: 380,
    month: "February 2026",
    title: "Pages from a prompt",
    intro:
      "Wirely stopped being a block builder. A model writes whole HTML pages from your prompt, and they land on a canvas.",
    artLabel:
      "A prompt box asking for a ceramic artist's portfolio, in front of three generated pages on the canvas.",
    added: [
      "One prompt generates several pages at once.",
      "A canvas with a dot grid that you pan and zoom.",
      "Sign-in and a database, so projects persist.",
      "A model picker, with OpenRouter as a second provider.",
      "Save a provider key in settings. Keys are stored encrypted.",
    ],
    fixed: ["Pages render in an iframe, with fixes to their height and loading."],
  },
  {
    id: "2026-01",
    compactHeight: 300,
    month: "January 2026",
    title: "The first prototype",
    intro: "Wirely started as a page builder made of sections you drag into order.",
    artLabel:
      "A sections list with the Features row lifted mid-drag over its new slot, beside the page preview with the Features section outlined.",
    added: [
      "A page made of sections: a navbar, a hero, features, and more, each with its own layouts.",
      "Drag sections to reorder them, or move them with buttons.",
      "Edit content in place, and preview a page.",
      "Zoom toward the cursor, and duplicate, rename, or delete pages.",
      "Export a page as HTML.",
      "Themes and colors, with dark mode.",
    ],
    fixed: [],
  },
];
