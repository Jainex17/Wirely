import { Skeleton } from "@/components/ui/skeleton";

/** The settings view's columns while it loads, inside the page box or the modal. */
export default function SettingsSkeleton() {
  return (
    <div className="flex min-h-0 w-full">
      <div className="flex w-56 shrink-0 flex-col gap-2 border-r border-border/70 bg-sidebar p-3 max-sm:hidden">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-9 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b border-border/70 px-6">
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-3.5 w-72" />
          <Skeleton className="mt-4 h-56 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
