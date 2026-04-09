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

        <div className="mt-10">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Settings
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Manage your account preferences and configuration.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="inline-block h-4 w-32 animate-pulse rounded bg-muted align-middle" />
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <aside>
            <div className="flex gap-1 overflow-hidden pb-1 lg:flex-col">
              <div className="rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-muted-foreground">
                Profile
              </div>
              <div className="rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-muted-foreground">
                Providers
              </div>
              <div className="rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-muted-foreground">
                Models
              </div>
            </div>
          </aside>

          <section>
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold text-foreground">Loading settings</h2>
              <p className="text-sm text-muted-foreground">
                Fetching your latest account and model configuration.
              </p>
              <div className="h-28 animate-pulse rounded-xl bg-muted" />
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
