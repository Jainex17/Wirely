/**
 * Every blog post, newest first. Each post is a route folder under app/blog
 * named by its slug. The blog index, the sitemap, and llms.txt read this list.
 */
export const BLOG_POSTS = [
  {
    slug: "build-check",
    title: "Checking a build against its design",
    description:
      "How your agent captures the page it built in your app and gets back what differs from the design it picked.",
    date: "2026-11-01",
  },
  {
    slug: "agent-subscription",
    title: "Why Wirely runs on the agent you already pay for",
    description:
      "Wirely has no credits and no server key. Your coding agent does the design work, and Wirely is the canvas it draws on.",
    date: "2026-11-01",
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
