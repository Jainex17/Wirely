import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function SettingLoading() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mt-10 space-y-3">
          <div className="h-12 w-52 animate-pulse rounded bg-muted" />
          <div className="h-5 w-96 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <aside>
            <div className="flex gap-1 overflow-hidden pb-1 lg:flex-col">
              <div className="h-12 min-w-[160px] animate-pulse rounded-lg bg-muted lg:min-w-0" />
              <div className="h-12 min-w-[160px] animate-pulse rounded-lg bg-muted lg:min-w-0" />
              <div className="h-12 min-w-[160px] animate-pulse rounded-lg bg-muted lg:min-w-0" />
            </div>
          </aside>

          <section>
            <div className="space-y-4">
              <div className="h-8 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
              <div className="h-28 animate-pulse rounded-xl bg-muted" />
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
