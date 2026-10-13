import Link from "next/link";

import WirelyMark from "@/components/icons/WirelyMark";
import { REPO_URL } from "@/lib/site";

/**
 * The footer on every public page. The landing page renders it too, so the
 * legal and docs links stay reachable from anywhere a signed-out visitor
 * lands.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2 font-display font-semibold text-foreground">
          <WirelyMark className="size-5" />
          Wirely
        </Link>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/docs" className="transition-colors hover:text-foreground">
            Docs
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

/**
 * The frame for a public text page: docs, privacy policy, terms. Children are
 * plain h2, h3, p, ul, ol, pre, and a elements; the wrapper styles them, so
 * the pages stay readable as markup.
 */
export default function SitePage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="border-b border-border">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <WirelyMark className="size-6" />
            Wirely
          </Link>
          <div className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/docs" className="transition-colors hover:text-foreground">
              Docs
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{title}</h1>
        <div className="mt-5 text-lg leading-relaxed text-muted-foreground">{intro}</div>
        <div className="mt-6 text-[15px] leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-foreground [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground [&_h2]:mt-14 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:pl-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:mt-4 [&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-card [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:text-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
