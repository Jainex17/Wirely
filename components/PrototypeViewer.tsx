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
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { injectIframeHeightReporter } from "@/lib/frameHeightReporter";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import {
  addPlayScript,
  BACK_TARGET,
  CLOSE_TARGET,
  PLAY_GOTO_MESSAGE,
  PLAY_KEY_MESSAGE,
  parsePageAction,
  parsePageTransition,
  type PageTransition,
  reverseTransition,
} from "@/lib/prototypeFlow";
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

const TRANSITION_MS = 280;

/** What the incoming and outgoing screens do during a transition. */
const TRANSITION_FRAMES: Record<
  Exclude<PageTransition, "instant">,
  { enter: Keyframe[]; leave: Keyframe[] }
> = {
  dissolve: { enter: [{ opacity: 0 }, { opacity: 1 }], leave: [] },
  "slide-left": {
    enter: [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
    leave: [{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }],
  },
  "slide-right": {
    enter: [{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }],
    leave: [{ transform: "translateX(0)" }, { transform: "translateX(100%)" }],
  },
};

/** One showing of a screen. `visit` keeps each showing's frame apart, so a frame is never reused. */
interface Shown {
  index: number;
  visit: number;
}

interface ViewState {
  current: Shown;
  /** The screen animating out, kept until the transition ends. */
  leaving: Shown | null;
  transition: PageTransition;
  /** True once the incoming frame has loaded, so the animation never shows a blank screen. */
  loaded: boolean;
  /** The screens the user came from, each with the transition that left it, for Back. */
  history: Array<{ index: number; transition: PageTransition }>;
  /** A page open above the screen, with its content height once its frame reports it. */
  overlay: { index: number; height: number | null } | null;
}

/** Moving to another screen closes any overlay. */
const moveTo = (
  state: ViewState,
  index: number,
  transition: PageTransition,
  history: ViewState["history"],
): ViewState => ({
  current: { index, visit: state.current.visit + 1 },
  leaving:
    transition !== "instant" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? state.current
      : null,
  transition,
  loaded: false,
  history,
  overlay: null,
});

// The overlay frame reports its content height under this id, through the
// same reporter the canvas uses, so the overlay can fit its content.
const OVERLAY_REPORTER_ID = "wirely-play-overlay";

export default function PrototypeViewer({
  wireId,
  projectTitle,
  pages,
  initialPageIndex,
}: PrototypeViewerProps) {
  const router = useRouter();
  const [view, setView] = React.useState<ViewState>({
    current: { index: initialPageIndex, visit: 0 },
    leaving: null,
    transition: "instant",
    loaded: false,
    history: [],
    overlay: null,
  });
  const currentIndex = view.current.index;
  const [deviceOverride, setDeviceOverride] = React.useState<ViewerDevice | null>(
    null,
  );
  const [zoom, setZoom] = React.useState(100);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const leavingRef = React.useRef<HTMLIFrameElement>(null);
  const overlayRef = React.useRef<HTMLIFrameElement>(null);
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
  const srcDocs = React.useMemo(
    () => (isBrowser ? pages.map((page) => addPlayScript(sanitizeIframeHtml(page.html ?? ""))) : []),
    [pages, isBrowser],
  );
  const overlayIndex = view.overlay?.index ?? null;
  const overlayPage = overlayIndex === null ? null : pages[overlayIndex];
  const overlayDoc = React.useMemo(
    () =>
      overlayIndex === null
        ? ""
        : injectIframeHeightReporter(srcDocs[overlayIndex] ?? "", OVERLAY_REPORTER_ID),
    [overlayIndex, srcDocs],
  );

  /** Shows a screen. Arrow keys and the screen strip pass no transition, so they stay instant. */
  const goToIndex = React.useCallback(
    (index: number, transition: PageTransition = "instant") => {
      const bounded = Math.max(0, Math.min(pages.length - 1, index));
      setView((state) =>
        bounded === state.current.index
          ? { ...state, overlay: null }
          : moveTo(state, bounded, transition, [
              ...state.history,
              { index: state.current.index, transition },
            ]),
      );
    },
    [pages.length],
  );

  /** Returns to the previous screen, undoing the transition that left it. */
  const goBack = React.useCallback(() => {
    setView((state) => {
      const previous = state.history.at(-1);
      return previous
        ? moveTo(state, previous.index, reverseTransition(previous.transition), state.history.slice(0, -1))
        : state;
    });
  }, []);

  // Runs the transition once the incoming frame has loaded, then drops the
  // outgoing frame. A layout effect, so the first painted frame is the start.
  React.useLayoutEffect(() => {
    if (!view.leaving || !view.loaded || view.transition === "instant") return;
    const frames = TRANSITION_FRAMES[view.transition];
    const options = { duration: TRANSITION_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" };
    const entering = iframeRef.current?.animate(frames.enter, options);
    const leaving = leavingRef.current?.animate(frames.leave, options);
    const visit = view.current.visit;
    const finish = () =>
      setView((state) =>
        state.current.visit === visit ? { ...state, leaving: null } : state,
      );
    if (!entering) {
      finish();
      return;
    }
    entering.onfinish = finish;
    return () => {
      entering.cancel();
      leaving?.cancel();
    };
  }, [view]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        goToIndex(currentIndex + 1);
      } else if (event.key === "ArrowLeft") {
        goToIndex(currentIndex - 1);
      }
    };

    // The screen and overlay frames report arrow keys, since a click inside one
    // takes the keyboard, and hotspot clicks. A hotspot opens a page only when
    // the viewer holds it.
    const handleFrameMessage = (event: MessageEvent) => {
      const fromOverlay = event.source === overlayRef.current?.contentWindow;
      if (!fromOverlay && event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        type?: unknown;
        id?: unknown;
        height?: unknown;
        key?: unknown;
        pageId?: unknown;
        transition?: unknown;
        action?: unknown;
      } | null;
      if (data?.type === PLAY_KEY_MESSAGE) {
        goToIndex(currentIndex + (data.key === "ArrowRight" ? 1 : -1));
      } else if (data?.type === "wirely-iframe-height") {
        const height = data.height;
        if (!fromOverlay || data.id !== OVERLAY_REPORTER_ID || typeof height !== "number") return;
        if (!Number.isFinite(height) || height <= 0) return;
        setView((state) => (state.overlay ? { ...state, overlay: { ...state.overlay, height } } : state));
      } else if (data?.type === PLAY_GOTO_MESSAGE) {
        if (data.pageId === CLOSE_TARGET) {
          if (fromOverlay) setView((state) => ({ ...state, overlay: null }));
          return;
        }
        if (data.pageId === BACK_TARGET) {
          goBack();
          return;
        }
        const index = pages.findIndex((page) => page.id === data.pageId);
        if (index === -1) return;
        if (parsePageAction(data.action) === "overlay") {
          setView((state) =>
            state.overlay?.index === index ? state : { ...state, overlay: { index, height: null } },
          );
        } else {
          goToIndex(index, parsePageTransition(data.transition));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("message", handleFrameMessage);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("message", handleFrameMessage);
    };
  }, [currentIndex, goBack, goToIndex, pages]);

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
                Play
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            title="Go back to the screen you came from"
            disabled={view.history.length === 0}
            onClick={goBack}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Back
          </Button>
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
            "relative overflow-hidden bg-background",
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
          {/* The outgoing frame renders first, so React keeps it in place and never reloads it. */}
          {[view.leaving, view.current].map((shown) => {
            if (!shown) return null;
            const isLeaving = shown === view.leaving;
            const page = pages[shown.index] ?? pages[0];
            return (
              <iframe
                ref={isLeaving ? leavingRef : iframeRef}
                key={`${page.id}-${device}-${shown.visit}`}
                title={`${page.title} play screen`}
                srcDoc={srcDocs[shown.index] ?? ""}
                onLoad={
                  isLeaving
                    ? undefined
                    : () =>
                        setView((state) =>
                          state.current.visit === shown.visit ? { ...state, loaded: true } : state,
                        )
                }
                className={cn(
                  "absolute inset-0 h-full w-full border-0 bg-background",
                  isLeaving && "pointer-events-none",
                )}
                // The incoming screen stays hidden until it loads, so the outgoing one shows meanwhile.
                style={!isLeaving && view.leaving && !view.loaded ? { visibility: "hidden" } : undefined}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
              />
            );
          })}
          {overlayPage && view.overlay ? (
            // A click on the backdrop closes the overlay. Clicks inside the
            // overlay frame stay in the frame and never reach it.
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/50 p-6"
              onClick={() => setView((state) => ({ ...state, overlay: null }))}
            >
              <iframe
                ref={overlayRef}
                key={`${overlayPage.id}-overlay`}
                title={`${overlayPage.title} overlay`}
                srcDoc={overlayDoc}
                className="max-h-full max-w-full shrink-0 rounded-[var(--radius)] border-0 bg-background shadow-2xl"
                // Drawn at no height first, so the reported height is the content's own.
                style={{
                  width: `${DEVICE_WIDTHS[overlayPage.deviceType]}px`,
                  height: `${view.overlay.height ?? 0}px`,
                  visibility: view.overlay.height === null ? "hidden" : undefined,
                }}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
        </div>
      </main>

      {isPresenting ? null : (
        <nav
          aria-label="Play screens"
          className="flex h-16 shrink-0 items-center gap-2 overflow-x-auto border-t border-border bg-card px-4"
        >
          {pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              onClick={() => goToIndex(index)}
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
