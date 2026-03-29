import { cn } from "@/lib/utils";

interface GeneratingPreviewPlaceholderProps {
  className?: string;
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%),linear-gradient(to_bottom,transparent,rgba(0,0,0,0.03))]" />
      <div className="absolute inset-0 opacity-35 [background-size:28px_28px] [background-image:linear-gradient(to_right,color-mix(in_srgb,var(--border)_42%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--border)_42%,transparent)_1px,transparent_1px)]" />

      <div className="relative h-full w-full p-6">
        <div className="relative h-full w-full overflow-hidden rounded-[32px] border border-border/60 bg-foreground/[0.06] shadow-[0_24px_60px_rgba(0,0,0,0.08)]">
          <div
            className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-foreground/[0.12] to-transparent"
            style={{ animation: "wirely-skeleton-shimmer 1.8s ease-in-out infinite" }}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border/70 bg-background/88 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative h-2 w-28 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-foreground/25"
              style={{ animation: "wirely-loading-bar 1.4s ease-in-out infinite" }}
            />
          </div>
          <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Generating page
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">Composing full layout</span>
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
