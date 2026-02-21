export default function ProfileLoading() {
  return (
    <main className="h-screen w-full overflow-hidden bg-muted p-3">
      <div className="flex h-full w-full flex-col gap-2">
        <div className="h-14 shrink-0 rounded-lg border border-border bg-card px-5">
          <div className="flex h-full animate-pulse items-center justify-between">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-8 w-24 rounded-md bg-muted" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-1 py-1 sm:px-2 sm:py-2">
          <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-hidden">
            <div className="grid h-full min-h-0 min-w-[860px] w-full grid-cols-[320px_minmax(0,1fr)] gap-5 lg:mx-auto lg:max-w-6xl xl:mx-0 xl:max-w-none">
              <aside className="h-full min-h-0 rounded-lg border border-border/80 bg-card p-6 sm:p-7">
                <div className="h-full animate-pulse space-y-4">
                  <div className="mx-auto h-20 w-20 rounded-full bg-muted" />
                  <div className="mx-auto h-6 w-36 rounded bg-muted" />
                  <div className="mx-auto h-4 w-44 rounded bg-muted" />
                  <div className="pt-4 space-y-3">
                    <div className="h-16 rounded-md bg-muted" />
                    <div className="h-16 rounded-md bg-muted" />
                  </div>
                </div>
              </aside>

              <section className="h-full min-h-0 rounded-lg border border-border/80 bg-card p-6 sm:p-7 lg:p-8">
                <div className="h-full animate-pulse space-y-4">
                  <div className="h-7 w-48 rounded bg-muted" />
                  <div className="h-4 w-72 rounded bg-muted" />
                  <div className="h-10 w-full rounded bg-muted" />
                  <div className="h-[calc(100%-8rem)] w-full rounded-md bg-muted" />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
