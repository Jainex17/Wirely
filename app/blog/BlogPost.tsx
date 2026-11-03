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

/** The frame for one post: its title, date, illustration, and a way back to the index. */
export default function BlogPost({ slug, children }: { slug: BlogSlug; children: React.ReactNode }) {
  const post = getBlogPost(slug);
  const { art } = post;
  return (
    <SitePage
      title={post.title}
      intro={
        <p className="text-base">
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
        </p>
      }
    >
      {/* A phone gets its own crop of the illustration, not the wide one shrunk. */}
      <picture className="mb-10 mt-8 block">
        <source
          media="(max-width: 599px)"
          srcSet={`${art.src}-compact.webp`}
          width={358}
          height={art.compactHeight}
        />
        <img
          src={`${art.src}-wide.webp`}
          alt={art.label}
          width={720}
          height={400}
          decoding="async"
          className="h-auto w-full"
        />
      </picture>
      {children}
      <p className="!mt-14 border-t border-border pt-6">
        <Link href="/blog">All posts</Link>
      </p>
    </SitePage>
  );
}
