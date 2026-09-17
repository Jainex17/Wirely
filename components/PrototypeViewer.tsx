"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";

type ViewerDevice = "desktop" | "mobile";

interface PrototypeViewerPage {
  id: string;
  title: string;
  html: string;
  deviceType: ViewerDevice;
}

interface PrototypeViewerProps {
  wireId: string;
  projectTitle: string;
  pages: PrototypeViewerPage[];
  initialPageIndex: number;
}

const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150];

const DEVICE_WIDTHS: Record<ViewerDevice, number> = {
  desktop: 1440,
  mobile: 375,
};

export default function PrototypeViewer({
  wireId,
  projectTitle,
  pages,
  initialPageIndex,
}: PrototypeViewerProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = React.useState(initialPageIndex);
  const [deviceOverride, setDeviceOverride] = React.useState<ViewerDevice | null>(
    null,
  );
  const [zoom, setZoom] = React.useState(100);

  const currentPage = pages[currentIndex] ?? pages[0];
  const device: ViewerDevice = deviceOverride ?? currentPage.deviceType;
  const deviceWidth = DEVICE_WIDTHS[device];

  const iframeHeight =
    device === "mobile" ? 812 : Math.round((deviceWidth * 9) / 16);

  const srcDoc = React.useMemo(
    () => sanitizeIframeHtml(currentPage.html ?? ""),
    [currentPage.html],
  );

  const goToIndex = React.useCallback(
    (index: number) => {
      const bounded = Math.max(0, Math.min(pages.length - 1, index));
      setCurrentIndex(bounded);
    },
    [pages.length],
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        goToIndex(currentIndex + 1);
      } else if (event.key === "ArrowLeft") {
        goToIndex(currentIndex - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentIndex, goToIndex]);

  return (
    <div className="flex h-screen w-full flex-col bg-muted">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Back to editor"
            title="Back to editor"
            onClick={() => router.push(`/wire/${wireId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {projectTitle}
            </p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Prototype
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Zoom"
          >
            {ZOOM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}%
              </option>
            ))}
          </select>
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              className={cn(
                "flex h-7 items-center gap-1 rounded px-2 text-xs",
                device === "desktop"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setDeviceOverride("desktop")}
            >
              <Monitor className="h-3.5 w-3.5" />
              Desktop
            </button>
            <button
              type="button"
              className={cn(
                "flex h-7 items-center gap-1 rounded px-2 text-xs",
                device === "mobile"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setDeviceOverride("mobile")}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Mobile
            </button>
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {currentIndex + 1}/{pages.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous screen"
              disabled={currentIndex === 0}
              onClick={() => goToIndex(currentIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next screen"
              disabled={currentIndex === pages.length - 1}
              onClick={() => goToIndex(currentIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 items-start justify-center overflow-auto p-6">
        <div
          className="rounded-[var(--radius)] border border-border bg-background shadow-xl"
          style={{
            width: `${deviceWidth}px`,
            height: `${iframeHeight}px`,
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top center",
          }}
        >
          <iframe
            key={`${currentPage.id}-${device}`}
            title={`${currentPage.title} prototype screen`}
            srcDoc={srcDoc}
            className="h-full w-full rounded-[inherit] border-0 bg-background"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        </div>
      </main>

      <nav
        aria-label="Prototype screens"
        className="flex h-16 shrink-0 items-center gap-2 overflow-x-auto border-t border-border bg-card px-4"
      >
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setCurrentIndex(index)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs transition",
              index === currentIndex
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span className="text-[10px] opacity-70">{index + 1}</span>
            <span className="max-w-[160px] truncate">{page.title}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
