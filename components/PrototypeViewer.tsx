"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Presentation,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { useIsBrowser } from "@/hooks/useIsBrowser";

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

const MOBILE_HEIGHT = 812;

/**
 * A click inside the sandboxed screen gives it the keyboard, so the arrow keys
 * would stop changing screens. The frame forwards them out by message instead
 * of the viewer reaching in, which the sandbox does not allow.
 */
const forwardArrowKeys = (html: string) => {
  if (!html) return html;
  const script = `<script>document.addEventListener("keydown",function(event){if(event.key==="ArrowLeft"||event.key==="ArrowRight"){window.parent.postMessage({type:"wirely-prototype-key",key:event.key},"*");}});</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${script}</body>`) : `${html}${script}`;
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
  const rootRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [isPresenting, setIsPresenting] = React.useState(false);
  const [screenSize, setScreenSize] = React.useState({ width: 0, height: 0 });

  const currentPage = pages[currentIndex] ?? pages[0];
  const device: ViewerDevice = deviceOverride ?? currentPage.deviceType;
  const deviceWidth = DEVICE_WIDTHS[device];

  // Presenting fills the screen: a desktop screen spans its width, a mobile
  // screen fits whole inside it.
  const presentScale =
    device === "mobile"
      ? Math.min(screenSize.width / deviceWidth, screenSize.height / MOBILE_HEIGHT)
      : screenSize.width / deviceWidth;
  const iframeHeight = isPresenting
    ? device === "mobile"
      ? MOBILE_HEIGHT
      : Math.round(screenSize.height / presentScale)
    : device === "mobile"
      ? MOBILE_HEIGHT
      : Math.round((deviceWidth * 9) / 16);
  const frameScale = isPresenting ? presentScale : zoom / 100;

  const isBrowser = useIsBrowser();
  const srcDoc = React.useMemo(
    () => (isBrowser ? forwardArrowKeys(sanitizeIframeHtml(currentPage.html ?? "")) : ""),
    [currentPage.html, isBrowser],
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

    const handleFrameKey = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string; key?: string } | null;
      if (data?.type !== "wirely-prototype-key") return;
      goToIndex(currentIndex + (data.key === "ArrowRight" ? 1 : -1));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("message", handleFrameKey);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("message", handleFrameKey);
    };
  }, [currentIndex, goToIndex]);

  React.useEffect(() => {
    const sync = () => {
      setIsPresenting(document.fullscreenElement === rootRef.current);
      setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const present = () => {
    rootRef.current?.requestFullscreen().catch(() => {
      // Refused, for example inside an embed without fullscreen permission.
    });
  };

  return (
    <div
      ref={rootRef}
      className={cn("flex h-screen w-full flex-col", isPresenting ? "bg-black" : "bg-muted")}
    >
      {isPresenting ? null : (
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
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            title="Present full screen. Arrow keys change screens, Escape exits."
            onClick={present}
          >
            <Presentation className="h-3.5 w-3.5" />
            Present
          </Button>
        </div>
      </header>
      )}

      <main
        className={cn(
          "relative flex flex-1 items-start justify-center",
          isPresenting ? "overflow-hidden" : "overflow-auto p-6",
        )}
      >
        <div
          className={cn(
            "bg-background",
            isPresenting && device === "desktop"
              ? ""
              : "rounded-[var(--radius)] border border-border shadow-xl",
          )}
          style={{
            width: `${deviceWidth}px`,
            height: `${iframeHeight}px`,
            transform: `scale(${frameScale})`,
            transformOrigin: "top center",
          }}
        >
          <iframe
            ref={iframeRef}
            key={`${currentPage.id}-${device}`}
            title={`${currentPage.title} prototype screen`}
            srcDoc={srcDoc}
            className="h-full w-full rounded-[inherit] border-0 bg-background"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        </div>
      </main>

      {isPresenting ? null : (
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
      )}
    </div>
  );
}
