import { Skeleton } from "@/components/ui/skeleton";

export default function SettingLoading() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <Skeleton className="h-14 w-full animate-pulse rounded-lg" />
      </div>
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6">
        <div className="pb-7 pt-10">
          <Skeleton className="h-9 w-44 animate-pulse" />
          <Skeleton className="mt-3 h-4 w-80 animate-pulse" />
        </div>
        <div className="flex gap-6 border-b border-border/60 pb-3">
          <Skeleton className="h-4 w-16 animate-pulse" />
          <Skeleton className="h-4 w-20 animate-pulse" />
          <Skeleton className="h-4 w-16 animate-pulse" />
        </div>
        <div className="grid gap-6 pt-10 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-12">
          <div>
            <Skeleton className="h-4 w-28 animate-pulse" />
            <Skeleton className="mt-3 h-3 w-40 animate-pulse" />
          </div>
          <Skeleton className="h-64 w-full animate-pulse rounded-xl" />
        </div>
      </div>
    </div>
  );
}
