import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/SitePage";
import { CHANGELOG } from "./entries";

export const metadata: Metadata = {
  title: "Changelog | Wirely",
  description: "What we have built in Wirely so far, month by month.",
  alternates: { canonical: "/changelog" },
};

// Not inside SitePage: the dated two-column layout needs its own wider main.
export default function ChangelogPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16 sm:py-20">
        <div className="lg:pl-[200px]">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Changelog</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            What we have built so far, month by month. Wirely is open source, so every change is
            also in the commit history.
          </p>
        </div>

        <div className="mt-16 space-y-24">
          {CHANGELOG.map(({ id, month, title, intro, artLabel, compactHeight, added, fixed }) => (
            <article key={id} id={id} className="scroll-mt-24 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
              <div className="mb-4 lg:mb-0">
                <a
                  href={`#${id}`}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground lg:sticky lg:top-24"
                >
                  <time dateTime={id}>{month}</time>
                </a>
              </div>

              <div className="min-w-0">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{intro}</p>

                {/* A phone gets its own crop of the illustration, not the wide one shrunk. */}
                <picture className="mt-8 block">
                  <source
                    media="(max-width: 599px)"
                    srcSet={`/changelog/${id}-compact.webp`}
                    width={358}
                    height={compactHeight}
                  />
                  <img
                    src={`/changelog/${id}-wide.webp`}
                    alt={artLabel}
                    width={720}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full max-w-[720px]"
                  />
                </picture>

                <ChangeList heading="New" items={added} />
                <ChangeList heading="Improvements and fixes" items={fixed} />
              </div>
            </article>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function ChangeList({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <h3 className="text-base font-semibold text-foreground">{heading}</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-border">
        {items.map((item) => (
          <li key={item} className="pl-1">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
