import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function WireLoading() {
  return (
    <main className="h-screen w-full overflow-hidden bg-muted p-3">
      <div className="flex h-full w-full flex-col gap-2">
        <header className="h-14 shrink-0 rounded-lg border border-border bg-card px-5">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Back to home"
                title="Back to home"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <h1 className="text-base font-semibold text-foreground">
                Wire Editor
              </h1>
            </div>
          </div>
        </header>

        <div className="flex h-[calc(100vh-5.75rem)] w-full flex-1 gap-2">
          <section className="w-[75%] min-w-0 rounded-lg border border-border bg-card p-4">
            <div className="h-[calc(100%-2.25rem)] w-full animate-pulse rounded-md bg-muted" />
          </section>

          <aside className="w-[25%] min-w-[320px] rounded-lg border border-border bg-card p-4">
            <div className="h-[calc(100%-2.25rem)] w-full space-y-3">
              <div className="h-24 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-[calc(100%-9.75rem)] w-full animate-pulse rounded-md bg-muted" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
