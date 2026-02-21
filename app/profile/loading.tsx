import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ProfileLoading() {
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
              <h1 className="text-base font-semibold text-foreground">Profile</h1>
            </div>
            <p className="text-sm text-muted-foreground">Loading profile...</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden px-1 py-1 sm:px-2 sm:py-2">
          <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-hidden">
            <div className="grid h-full min-h-0 min-w-[860px] w-full grid-cols-[320px_minmax(0,1fr)] gap-5 lg:mx-auto lg:max-w-6xl xl:mx-0 xl:max-w-none">
              <aside className="h-full min-h-0 rounded-lg border border-border/80 bg-card p-6 sm:p-7">
                <div className="h-full space-y-4">
                  <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-muted" />
                  <p className="text-center text-xl font-semibold text-foreground">Profile</p>
                  <p className="text-center text-sm text-muted-foreground">Loading account details...</p>
                  <p className="mx-auto max-w-[240px] text-center text-xs text-muted-foreground">
                    Account details and generation settings.
                  </p>
                  <div className="pt-4 space-y-3">
                    <div className="h-16 animate-pulse rounded-md bg-muted" />
                    <div className="h-16 animate-pulse rounded-md bg-muted" />
                  </div>
                </div>
              </aside>

              <section className="h-full min-h-0 rounded-lg border border-border/80 bg-card p-6 sm:p-7 lg:p-8">
                <div className="h-full space-y-4">
                  <h2 className="text-xl font-semibold text-foreground">Profile Settings</h2>
                  <p className="text-sm text-muted-foreground">
                    Manage details, API keys, and model availability.
                  </p>
                  <div className="h-10 w-full animate-pulse rounded bg-muted" />
                  <div className="h-[calc(100%-8rem)] w-full animate-pulse rounded-md bg-muted" />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
