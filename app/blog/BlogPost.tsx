import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import { formatPostDate, getBlogPost, type BlogSlug } from "./posts";

export function blogPostMetadata(slug: BlogSlug): Metadata {
  const post = getBlogPost(slug);
  return {
    title: `${post.title} | Wirely`,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { type: "article", publishedTime: post.date },
  };
}

/** The frame for one post: its title, date, and a way back to the index. */
export default function BlogPost({ slug, children }: { slug: BlogSlug; children: React.ReactNode }) {
  const post = getBlogPost(slug);
  return (
    <SitePage
      title={post.title}
      intro={
        <p className="text-base">
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
        </p>
      }
    >
      {children}
      <p className="!mt-14 border-t border-border pt-6">
        <Link href="/blog">All posts</Link>
      </p>
    </SitePage>
  );
}
