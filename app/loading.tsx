import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
      <main>
        <section className="mx-auto w-full max-w-3xl px-4 pb-14 pt-24 text-center sm:px-6">
          <Skeleton className="mx-auto h-10 w-72" />
          <Skeleton className="mt-10 h-44 w-full rounded-2xl" />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Skeleton className="h-7 w-52 rounded-full" />
            <Skeleton className="h-7 w-60 rounded-full" />
            <Skeleton className="h-7 w-44 rounded-full" />
          </div>
        </section>
        <section className="mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6">
          <Skeleton className="h-4 w-36" />
          <div className="mt-6 border-t border-border">
            <Skeleton className="mt-6 h-6 w-full max-w-md" />
            <Skeleton className="mt-6 h-6 w-full max-w-sm" />
            <Skeleton className="mt-6 h-6 w-full max-w-lg" />
          </div>
        </section>
      </main>
    </div>
  );
}
