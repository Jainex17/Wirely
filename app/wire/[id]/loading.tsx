export default function WireLoading() {
  return (
    <main className="h-screen w-full overflow-hidden bg-muted p-3">
      <div className="flex h-full w-full flex-col gap-2">
        <div className="h-14 shrink-0 rounded-lg border border-border bg-card px-5">
          <div className="flex h-full animate-pulse items-center justify-between">
            <div className="h-5 w-52 rounded bg-muted" />
            <div className="h-8 w-24 rounded-md bg-muted" />
          </div>
        </div>

        <div className="flex h-[calc(100vh-5.75rem)] w-full flex-1 gap-2">
          <section className="w-[75%] min-w-0 rounded-lg border border-border bg-card p-4">
            <div className="h-full w-full animate-pulse space-y-3">
              <div className="h-9 w-44 rounded bg-muted" />
              <div className="h-[calc(100%-3rem)] w-full rounded-md bg-muted" />
            </div>
          </section>

          <aside className="w-[25%] min-w-[320px] rounded-lg border border-border bg-card p-4">
            <div className="h-full w-full animate-pulse space-y-3">
              <div className="h-7 w-28 rounded bg-muted" />
              <div className="h-24 w-full rounded-md bg-muted" />
              <div className="h-9 w-full rounded-md bg-muted" />
              <div className="h-[calc(100%-12rem)] w-full rounded-md bg-muted" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
