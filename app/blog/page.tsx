import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import { BLOG_POSTS, formatPostDate } from "./posts";

export const metadata: Metadata = {
  title: "Blog | Wirely",
  description: "Notes on how Wirely works and why it is built the way it is.",
  alternates: { canonical: "/blog" },
};

// Divs and spans on purpose: SitePage styles h2, p, and list tags for long
// form text, and the index wants tighter rows.
export default function BlogIndexPage() {
  return (
    <SitePage title="Blog" intro={<p>Notes on how Wirely works and why it is built this way.</p>}>
      <div className="mt-10 divide-y divide-border border-y border-border">
        {BLOG_POSTS.map((post) => (
          <article key={post.slug} className="py-6">
            <time dateTime={post.date} className="block text-sm">
              {formatPostDate(post.date)}
            </time>
            <Link
              href={`/blog/${post.slug}`}
              className="mt-2 block font-display text-xl font-semibold tracking-tight !text-foreground !no-underline hover:!text-primary"
            >
              {post.title}
            </Link>
            <span className="mt-2 block">{post.description}</span>
          </article>
        ))}
      </div>
    </SitePage>
  );
}
