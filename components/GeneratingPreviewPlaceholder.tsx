import { cn } from "@/lib/utils";

interface GeneratingPreviewPlaceholderProps {
  className?: string;
}

function SkeletonBlock({
  className,
  delay = "0s",
}: {
  className?: string;
  delay?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[calc(var(--radius)-4px)] bg-foreground/[0.07]",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      <div
        className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent"
        style={{ animation: "wirely-skeleton-shimmer 1.8s ease-in-out infinite" }}
      />
    </div>
  );
}

export default function GeneratingPreviewPlaceholder({
  className,
}: GeneratingPreviewPlaceholderProps) {
  return (
    <div
      className={cn(
        "relative isolate h-full w-full overflow-hidden border border-border/70 bg-background",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Generating page preview"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.02))]" />
      <div className="absolute inset-0 opacity-40 [background-size:24px_24px] [background-image:linear-gradient(to_right,color-mix(in_srgb,var(--border)_45%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--border)_45%,transparent)_1px,transparent_1px)]" />

      <div className="relative flex h-full w-full flex-col">
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-9 w-9 rounded-xl" />
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-28" delay="0.12s" />
              <SkeletonBlock className="h-2.5 w-20" delay="0.2s" />
            </div>
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-20 rounded-full" delay="0.08s" />
            <SkeletonBlock className="h-9 w-9 rounded-full" delay="0.16s" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-0">
          <aside className="border-r border-border/70 px-5 py-5">
            <div className="space-y-3">
              <SkeletonBlock className="h-3 w-24" delay="0.1s" />
              <SkeletonBlock className="h-10 w-full rounded-xl" delay="0.16s" />
              <SkeletonBlock className="h-10 w-[82%] rounded-xl" delay="0.22s" />
              <SkeletonBlock className="h-10 w-[90%] rounded-xl" delay="0.28s" />
            </div>

            <div className="mt-8 space-y-4">
              <SkeletonBlock className="h-3 w-18" delay="0.14s" />
              <SkeletonBlock className="h-24 w-full rounded-2xl" delay="0.24s" />
              <SkeletonBlock className="h-24 w-full rounded-2xl" delay="0.32s" />
            </div>
          </aside>

          <div className="flex min-h-0 flex-col px-6 py-5">
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-40" delay="0.12s" />
              <SkeletonBlock className="h-3 w-full max-w-[420px]" delay="0.2s" />
              <SkeletonBlock className="h-3 w-full max-w-[360px]" delay="0.26s" />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <SkeletonBlock className="h-24 rounded-2xl" delay="0.1s" />
              <SkeletonBlock className="h-24 rounded-2xl" delay="0.18s" />
              <SkeletonBlock className="h-24 rounded-2xl" delay="0.26s" />
            </div>

            <div className="mt-5 grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
              <SkeletonBlock className="min-h-[240px] rounded-[28px]" delay="0.16s" />
              <div className="grid gap-4">
                <SkeletonBlock className="h-32 rounded-[24px]" delay="0.22s" />
                <SkeletonBlock className="h-full min-h-[120px] rounded-[24px]" delay="0.3s" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border/70 bg-background/88 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative h-2 w-24 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-foreground/25"
              style={{ animation: "wirely-loading-bar 1.4s ease-in-out infinite" }}
            />
          </div>
          <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Generating page
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">Building layout</span>
      </div>

      <style>{`
        @keyframes wirely-skeleton-shimmer {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(320%);
          }
        }

        @keyframes wirely-loading-bar {
          0% {
            transform: translateX(-110%);
          }
          50% {
            transform: translateX(180%);
          }
          100% {
            transform: translateX(320%);
          }
        }
      `}</style>
    </div>
  );
}
