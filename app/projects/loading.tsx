import { Skeleton } from "@/components/ui/skeleton";

// Mirrors HomeClient's sidebar, toolbar, and card grid so the real projects
// page lands in the same place instead of shifting the layout.
export default function ProjectsLoading() {
  return (
    <div className="flex min-h-[100dvh] bg-background">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border px-3 pb-3 md:flex">
        <div className="flex h-14 items-center px-2.5">
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="mt-6 h-3 w-14" />
        <Skeleton className="mt-auto h-8 w-36" />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="px-4 pt-3 md:hidden">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
        <main className="w-full px-4 pb-28 sm:px-8">
          <div className="flex items-center justify-between gap-3 pt-6 md:h-14 md:pt-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-56" />
          </div>
          <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-5">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="aspect-[16/10] bg-background" />
                <div className="border-t border-border px-4 py-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-1.5 h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}
