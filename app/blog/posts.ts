/**
 * Every blog post, newest first. Each post is a route folder under app/blog
 * named by its slug. The blog index, the sitemap, and llms.txt read this list.
 *
 * `art` is the illustration under the title: `${src}-wide.webp` at 720 by 400
 * and `${src}-compact.webp` at 358 wide and `compactHeight` tall for phones.
 */
export const BLOG_POSTS = [
  {
    slug: "edit-one-element",
    title: "Change one element without rewriting the page",
    description:
      "Pick an element on the canvas, send its link to your agent, and the agent edits that element and nothing else.",
    date: "2026-11-03",
    art: {
      src: "/blog/edit-one-element",
      compactHeight: 470,
      label:
        "A button picked on the canvas with its inspector open, beside a terminal where the agent reads that button and changes one element.",
    },
  },
  {
    slug: "comments-for-your-agent",
    title: "Comments your agent can fix",
    description:
      "Pin comments on pages, share a review link for other people's comments, and have your agent fix and resolve each one.",
    date: "2026-11-03",
    art: {
      src: "/blog/comments-for-your-agent",
      compactHeight: 440,
      label:
        "The comments panel with one resolved comment and one open, the open comment's pin on a pricing page, and the agent resolving the first one.",
    },
  },
  {
    slug: "clickable-prototype",
    title: "Click through your pages before you build them",
    description:
      "Link elements to pages, press Play, and click through the flow the way a user would.",
    date: "2026-11-03",
    art: {
      src: "/blog/clickable-prototype",
      compactHeight: 440,
      label:
        "A Choose Pro link picked on a pricing page, its inspector set to open the Checkout page with a slide, and the Checkout page beside it.",
    },
  },
  {
    slug: "build-check",
    title: "Checking a build against its design",
    description:
      "How your agent captures the page it built in your app and gets back what differs from the design it picked.",
    date: "2026-11-01",
    art: {
      src: "/blog/build-check",
      compactHeight: 440,
      label:
        "A pricing design beside the captured build on the canvas, with the report listing a missing line, a smaller heading, and a different button color.",
    },
  },
  {
    slug: "agent-subscription",
    title: "Why Wirely runs on the agent you already pay for",
    description:
      "Wirely has no credits and no server key. Your coding agent does the design work, and Wirely is the canvas it draws on.",
    date: "2026-11-01",
    // The changelog's September illustration shows the same thing.
    art: {
      src: "/changelog/2026-09",
      compactHeight: 440,
      label:
        "A terminal where a coding agent calls add_page and get_page_png, beside the canvas with the new pricing page selected.",
    },
  },
] as const;

export type BlogSlug = (typeof BLOG_POSTS)[number]["slug"];

export function getBlogPost(slug: BlogSlug) {
  const post = BLOG_POSTS.find((entry) => entry.slug === slug);
  if (!post) throw new Error(`Unknown blog post: ${slug}`);
  return post;
}

/** "2026-11-01" to "November 1, 2026", fixed to UTC so server and client agree. */
export function formatPostDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
