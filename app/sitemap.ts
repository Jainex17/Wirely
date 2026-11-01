import type { MetadataRoute } from "next";

import { BLOG_POSTS } from "@/app/blog/posts";
import { DOCS_PAGES } from "@/app/docs/DocsNav";
import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";

// The public routes; everything else sits behind sign-in. URLs use the
// canonical www host, which is the one that serves content. The apex only
// redirects there.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: CANONICAL_APP_ORIGIN,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...DOCS_PAGES.map((page) => ({
      url: `${CANONICAL_APP_ORIGIN}${page.href}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${CANONICAL_APP_ORIGIN}/blog`, changeFrequency: "weekly", priority: 0.6 },
    ...BLOG_POSTS.map((post) => ({
      url: `${CANONICAL_APP_ORIGIN}/blog/${post.slug}`,
      lastModified: post.date,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
    { url: `${CANONICAL_APP_ORIGIN}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${CANONICAL_APP_ORIGIN}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
