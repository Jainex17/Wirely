import Link from "next/link";

/** The docs pages in reading order. The sitemap and llms.txt read this list too. */
export const DOCS_PAGES = [
  { href: "/docs", label: "Connect your agent" },
  { href: "/docs/canvas", label: "Use the canvas" },
  { href: "/docs/self-host", label: "Run it yourself" },
  { href: "/docs/security", label: "Security" },
] as const;

export type DocsHref = (typeof DOCS_PAGES)[number]["href"];

/** The row of docs pages under each docs title, with the current one marked. */
export default function DocsNav({ current }: { current: DocsHref }) {
  return (
    <nav aria-label="Docs" className="mt-8 flex flex-wrap gap-2 border-b border-border pb-6">
      {DOCS_PAGES.map((page) => {
        const isCurrent = page.href === current;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={isCurrent ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isCurrent
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
