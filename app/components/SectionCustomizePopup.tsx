"use client";

import { useEffect, useRef, useState } from "react";
import { SECTION_LAYOUTS } from "../lib/sectionLayouts";
import { type SectionData } from "../store/useEditorStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, X, LayoutTemplate, Trash2, Layout } from "lucide-react";

interface SectionCustomizePopupProps {
  isOpen: boolean;
  section: SectionData | null;
  onLayoutSelect: (layoutId: string) => void;
  onUpdate: (data: Partial<SectionData>) => void;
  onDelete: () => void;
  onClose: () => void;
}

type ViewState = "main" | "layout" | "scheme";

const COLOR_SCHEMES = [
  {
    id: "scheme-1",
    name: "Default",
    colors: ["var(--background)", "var(--card)", "var(--foreground)"],
  },
  {
    id: "scheme-2",
    name: "Primary",
    colors: ["var(--primary)", "var(--secondary)", "var(--accent)"],
  },
  {
    id: "scheme-3",
    name: "Muted",
    colors: ["var(--muted)", "var(--card)", "var(--foreground)"],
  },
  {
    id: "scheme-4",
    name: "Charts",
    colors: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"],
  },
];

export default function SectionCustomizePopup({
  isOpen,
  section,
  onLayoutSelect,
  onUpdate,
  onDelete,
  onClose,
}: SectionCustomizePopupProps) {
  const [view, setView] = useState<ViewState>("main");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const initialName =
    section?.name ||
    (section?.type
      ? section.type.charAt(0).toUpperCase() + section.type.slice(1)
      : "");
  const [name, setName] = useState(initialName);

  const handleNameChange = (val: string) => {
    setName(val);
    onUpdate({ name: val });
  };

  const handleSchemeSelect = (color: string) => {
    onUpdate({ backgroundColor: color });
    setView("main");
  };

  if (!isOpen || !section) return null;

  const layouts = SECTION_LAYOUTS[section.type];
  const selectedSectionType = section.type;

  return (
    <div
      className="fixed left-[4.5rem] top-4 z-50 animate-in fade-in slide-in-from-left-4 duration-200 select-text cursor-default"
      onClick={(e) => e.stopPropagation()}
      data-scroll-lock="modal"
    >
      <div className="bg-card rounded-lg shadow-xl border border-border overflow-hidden w-[280px] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-popover">
          <div className="flex items-center gap-2">
            {view !== "main" && (
              <button
                onClick={() => setView("main")}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <span className="font-semibold text-foreground capitalize">
              {view === "main"
                ? selectedSectionType
                : view === "layout"
                  ? "Select Layout"
                  : "Select Scheme"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} className="p-4">
          {view === "main" ? (
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setView("layout")}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border rounded hover:border-ring hover:text-primary transition-all group text-foreground"
                >
                  <LayoutTemplate className="w-4 h-4 text-foreground group-hover:text-primary" />
                  <span className="text-sm font-medium">Layout</span>
                </button>
                <button
                  onClick={() => setView("scheme")}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border rounded hover:border-ring hover:text-primary transition-all group text-foreground"
                >
                  <div className="flex -space-x-1">
                    <div className="w-3 h-3 rounded-full bg-primary border border-card" />
                    <div className="w-3 h-3 rounded-full bg-accent border border-card" />
                  </div>
                  <span className="text-sm font-medium">Scheme</span>
                </button>
              </div>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-destructive/10 border border-destructive rounded hover:bg-destructive/20 hover:border-destructive transition-all group text-destructive"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium">Delete Section</span>
              </button>
            </div>
          ) : view === "layout" ? (
            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
              {layouts.map((layout) => (
                <button
                  key={layout.id}
                  onClick={() => onLayoutSelect(layout.id)}
                  className="flex items-center gap-3 p-3 text-left rounded border border-border hover:border-ring hover:bg-secondary transition-all group"
                >
                  <div className="w-10 h-10 rounded bg-secondary flex-shrink-0 group-hover:bg-secondary transition-colors flex items-center justify-center text-muted-foreground group-hover:text-primary">
                    <Layout className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground group-hover:text-foreground">
                      {layout.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Click to apply
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {COLOR_SCHEMES.map((scheme) => (
                <button
                  key={scheme.id}
                  onClick={() => handleSchemeSelect(scheme.colors[0])}
                  className="flex items-center gap-3 p-3 text-left rounded border border-border hover:border-ring hover:bg-secondary transition-all group"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      {scheme.colors.map((color) => (
                        <div
                          key={color}
                          className="w-6 h-6 rounded-full border border-foreground/10 shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-foreground ml-auto group-hover:text-foreground">
                    {scheme.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-card rounded-lg shadow-xl border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete Section?
            </AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-muted-foreground text-sm">
            This will permanently remove this section from the page. This action
            cannot be undone.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-card border border-border text-muted-foreground hover:bg-secondary">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete();
                onClose();
              }}
              className="bg-destructive text-destructive-foreground hover:opacity-90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
