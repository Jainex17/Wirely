"use client";

/**
 * The pieces of editor chrome the Prototype and Editor tabs share, so the two
 * canvases look and behave the same: the floating tool bar, zoom controls,
 * the side panels' tab header and collapse toggles, and the account footer.
 */

import { useClerk } from "@clerk/nextjs";
import { ChevronUp, Contrast, Minus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import UserAccountMenu, { type UserAccountMenuUser } from "@/components/UserAccountMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type CanvasBackground, useEditorStore } from "@/store/useEditorStore";

export const toolbarClass =
  "absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-sidebar p-1 shadow-xl";

export const menuTriggerClass =
  "flex h-8 items-center gap-0.5 rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground";

/** A tool in the bottom bar. A shortcut goes at the end of the label, like "Move (V)". */
export function ToolButton({
  label,
  detail,
  isActive = false,
  onClick,
  children,
}: {
  label: string;
  detail?: string;
  isActive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      data-tip-detail={detail}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export const ToolbarDivider = () => <div className="mx-1 h-5 w-px bg-border" />;

const BACKGROUND_LABELS: Record<CanvasBackground, string> = { dark: "Dark", gray: "Gray", light: "Light" };

/** Picks the canvas background. Both canvases share the choice, kept in local storage. */
export function CanvasBackgroundMenu() {
  const canvasBackground = useEditorStore((state) => state.canvasBackground);
  const setCanvasBackground = useEditorStore((state) => state.setCanvasBackground);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={menuTriggerClass}
        aria-label="Canvas background"
        data-tip-detail={`${BACKGROUND_LABELS[canvasBackground]} now. Shared by both tabs.`}
      >
        <Contrast className="h-4 w-4" />
        <ChevronUp className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" sideOffset={8} className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Canvas background</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={canvasBackground}
          onValueChange={(value) => setCanvasBackground(value as CanvasBackground)}
        >
          {(Object.keys(BACKGROUND_LABELS) as CanvasBackground[]).map((background) => (
            <DropdownMenuRadioItem key={background} value={background}>
              {BACKGROUND_LABELS[background]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Zoom out, zoom to fit, and zoom in, for the canvas's top-right corner. `zoom` is a percentage. */
export function ZoomControls({
  zoom,
  canZoomOut = true,
  canZoomIn = true,
  onZoomOut,
  onFit,
  onZoomIn,
}: {
  zoom: number;
  canZoomOut?: boolean;
  canZoomIn?: boolean;
  onZoomOut: () => void;
  onFit: () => void;
  onZoomIn: () => void;
}) {
  const buttonClass =
    "flex h-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div className="flex items-center rounded-lg border border-border bg-sidebar p-0.5 shadow-lg">
      <button type="button" onClick={onZoomOut} disabled={!canZoomOut} className={cn(buttonClass, "w-7")} aria-label="Zoom out (-)">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onFit}
        className={cn(buttonClass, "min-w-12 px-1.5 text-xs font-medium tabular-nums text-foreground")}
        aria-label="Zoom to fit (Shift+1)"
        data-tip-detail={`At ${Math.round(zoom)}% now. Click to fit everything.`}
      >
        {Math.round(zoom)}%
      </button>
      <button type="button" onClick={onZoomIn} disabled={!canZoomIn} className={cn(buttonClass, "w-7")} aria-label="Zoom in (+)">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Hides or shows a side panel. It stays on screen while its panel is hidden, as the way back. */
export function PanelToggle({
  side,
  name,
  isCollapsed,
  onToggle,
}: {
  side: "left" | "right";
  name: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const Icon =
    side === "left"
      ? isCollapsed
        ? PanelLeftOpen
        : PanelLeftClose
      : isCollapsed
        ? PanelRightOpen
        : PanelRightClose;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${isCollapsed ? "Show" : "Hide"} ${name}`}
      aria-expanded={!isCollapsed}
      data-tip-detail={isCollapsed ? undefined : "Gives the canvas the room"}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** The collapsed form of a side panel: just its toggle, floating over the canvas corner. */
export const FloatingPanelToggle = ({ className, children }: { className: string; children: ReactNode }) => (
  <div className={cn("absolute top-3 z-30 rounded-lg border border-sidebar-border bg-sidebar p-0.5 shadow-lg", className)}>
    {children}
  </div>
);

/** The right panel's header: its tabs, then whatever goes at the end, usually the panel toggle. */
export function SidePanelTabs<Tab extends string>({
  tabs,
  active,
  onChange,
  end,
}: {
  tabs: ReadonlyArray<{ id: Tab; label: string; detail: string }>;
  active: Tab;
  onChange: (tab: Tab) => void;
  end?: ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border px-2">
      <div role="tablist" className="flex items-center gap-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            data-tip={tab.label}
            data-tip-detail={tab.detail}
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[13px]",
              active === tab.id
                ? "bg-foreground/10 font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {end}
    </div>
  );
}

/** The bottom of the left panel: the account menu and a feedback link. */
export function AccountFooter({ user }: { user: UserAccountMenuUser }) {
  const { signOut } = useClerk();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await signOut();
    } finally {
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  };
  return (
    <div className="flex shrink-0 items-center border-t border-sidebar-border p-2">
      <UserAccountMenu
        user={user}
        isLoggingOut={isLoggingOut}
        onLogout={logout}
        logoutDescription="You will need to sign in again to continue editing this project."
      />
      <a
        href="https://github.com/Jainex17/Wirely/issues"
        target="_blank"
        rel="noreferrer"
        data-tip="Feedback"
        data-tip-detail="Opens Wirely's GitHub issues"
        className="ml-auto px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        Feedback
      </a>
    </div>
  );
}
