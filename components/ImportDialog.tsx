"use client";

import {
  ArrowLeft,
  ChevronRight,
  Component,
  FileCode2,
  FolderGit2,
  Globe,
  Import,
  LoaderCircle,
  Radio,
  Upload,
} from "lucide-react";
import { Check, Copy } from "lucide";
import MorphIcon from "@/components/MorphIcon";
import { type DragEvent, type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { type AgentImportSource, buildAgentImportPrompt } from "@/lib/importPrompts";
import type { PageDeviceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/useEditorStore";

type Source = "website" | "file" | AgentImportSource;

interface SourceInfo {
  id: Source;
  title: string;
  summary: string;
  description: string;
  icon: typeof Globe;
}

const DIRECT_SOURCES: SourceInfo[] = [
  {
    id: "website",
    title: "Website",
    summary: "Any public page, as it looks now.",
    description: "Wirely loads the page and adds it as an editable page. Scripts are removed.",
    icon: Globe,
  },
  {
    id: "file",
    title: "HTML or SVG file",
    summary: "A page or artwork from your computer.",
    description: "An HTML file becomes a page. An SVG becomes artwork you can edit with the pen tool.",
    icon: FileCode2,
  },
];

const AGENT_SOURCES: SourceInfo[] = [
  {
    id: "live_app",
    title: "Live app",
    summary: "Behind a login, a VPN, or on localhost.",
    description: "Your agent captures the page from your machine, where Wirely cannot reach.",
    icon: Radio,
  },
  {
    id: "codebase",
    title: "Codebase",
    summary: "Screens read from your repo's routes.",
    description: "Your agent reads the routes in your repository and adds each main screen.",
    icon: FolderGit2,
  },
  {
    id: "figma",
    title: "Figma frame",
    summary: "Needs the Figma MCP in your agent.",
    description: "Your agent reads the frame through its Figma MCP and rebuilds it as a page.",
    icon: Component,
  },
];

const SOURCES = [...DIRECT_SOURCES, ...AGENT_SOURCES];

// The pages API takes up to 600,000 bytes per request. JSON escaping grows the
// HTML, so the encoded request is checked too, not only the file.
const MAX_FILE_BYTES = 500_000;
const MAX_REQUEST_BYTES = 600_000;

type CreatedPage = { id: string; title: string; htmlContent: string; deviceType: string };

/** Puts a page the server just created on the canvas and takes the user to it. */
const showCreatedPage = (page: CreatedPage) => {
  const state = useEditorStore.getState();
  // The page poll may have brought it in already.
  if (!state.pages.some((existing) => existing.id === page.id)) {
    state.createPage(page.title, undefined, page.id, page.deviceType as PageDeviceType);
    state.setPageHtml(page.id, page.htmlContent);
  }
  state.focusPage(page.id);
};

const postJson = async (url: string, body: unknown, fallbackError: string) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { page?: CreatedPage; error?: string } | null;
  if (!response.ok || !payload?.page) throw new Error(payload?.error || fallbackError);
  return payload.page;
};

/**
 * The Import button and its dialog. A website or a file becomes a page right
 * here. Sources only the user's agent can reach copy a prompt to paste into it,
 * since Wirely cannot see the user's machine or their other accounts.
 */
export default function ImportDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [link, setLink] = useState("");
  const [deviceType, setDeviceType] = useState<"desktop" | "mobile">("desktop");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fieldId = useId();

  const selected = SOURCES.find((item) => item.id === source) ?? null;
  const isAgentSource = source === "live_app" || source === "codebase" || source === "figma";
  // The dialog only renders in the browser, where the editor's origin is known.
  const editorUrl =
    typeof window === "undefined" ? `/wire/${projectId}` : `${window.location.origin}/wire/${projectId}`;
  const prompt = isAgentSource ? buildAgentImportPrompt(source, editorUrl, link) : "";

  const pick = (next: Source | null) => {
    setSource(next);
    setLink("");
    setError(null);
    setCopied(false);
  };

  const close = () => {
    setOpen(false);
    pick(null);
  };

  const finish = (page: CreatedPage) => {
    showCreatedPage(page);
    toast.success(`Imported "${page.title}".`);
    close();
  };

  const importWebsite = async () => {
    if (!link.trim() || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      finish(await postJson(`/api/projects/${projectId}/import`, { url: link, deviceType, tabId: useEditorStore.getState().activeTabId }, "Could not import the page."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import the page.");
    } finally {
      setIsBusy(false);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file || isBusy) return;
    const name = file.name.toLowerCase();
    const isSvg = name.endsWith(".svg") || file.type === "image/svg+xml";
    if (!isSvg && !name.endsWith(".html") && !name.endsWith(".htm")) {
      setError("Pick an .html, .htm, or .svg file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is over 500 KB. Pick a smaller one.");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const html = await file.text();
      const documentTitle = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
      const body = {
        title: documentTitle || file.name.replace(/\.[^.]+$/, ""),
        deviceType: isSvg ? "vector" : deviceType,
        htmlContent: html,
        tabId: useEditorStore.getState().activeTabId,
      };
      if (new Blob([JSON.stringify(body)]).size > MAX_REQUEST_BYTES) {
        throw new Error("That file is too large to import once encoded. Pick a smaller one.");
      }
      finish(await postJson(`/api/projects/${projectId}/pages`, body, "Could not import the file."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import the file.");
    } finally {
      setIsBusy(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Prompt copied. Paste it into your agent.");
    } catch {
      setError("Could not copy. Select the prompt and copy it by hand.");
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void importFile(event.dataTransfer.files[0]);
  };

  const Icon = selected?.icon ?? Import;

  return (
    <>
      <button
        type="button"
        aria-label="Import"
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <Import className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : !isBusy && close())}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[560px]">
          <header className="flex items-start gap-3.5 px-6 pb-5 pt-6 pr-12">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground/[0.03]">
              <Icon className="h-[18px] w-[18px] text-foreground" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="text-base font-semibold leading-tight">
                {selected ? selected.title : "Import into Wirely"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-relaxed">
                {selected ? selected.description : "Each import becomes a page on the canvas."}
              </DialogDescription>
            </div>
          </header>

          {!selected ? (
            <div className="space-y-5 px-6 pb-6">
              <SourceGroup label="Into Wirely" sources={DIRECT_SOURCES} onPick={pick} />
              <SourceGroup label="Through your agent" sources={AGENT_SOURCES} onPick={pick} />
            </div>
          ) : (
            <>
              <div className="space-y-5 px-6 pb-6">
                {source === "website" ? (
                  <>
                    <Field id={fieldId} label="Website URL" error={error}>
                      <input
                        id={fieldId}
                        type="url"
                        autoFocus
                        value={link}
                        disabled={isBusy}
                        aria-invalid={error ? true : undefined}
                        onChange={(event) => {
                          setLink(event.target.value);
                          setError(null);
                        }}
                        onKeyDown={(event) => event.key === "Enter" && void importWebsite()}
                        placeholder="https://example.com/pricing"
                        className={inputClass}
                      />
                    </Field>
                    <DevicePicker value={deviceType} onChange={setDeviceType} disabled={isBusy} />
                  </>
                ) : null}

                {source === "file" ? (
                  <>
                    <div>
                      <label
                        onDragOver={(event) => {
                          event.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={onDrop}
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-9 text-center transition-colors",
                          isDragging
                            ? "border-foreground/40 bg-foreground/[0.06]"
                            : "border-border hover:border-foreground/25 hover:bg-foreground/[0.03]",
                          isBusy && "pointer-events-none opacity-60",
                        )}
                      >
                        <input
                          type="file"
                          accept=".html,.htm,.svg,text/html,image/svg+xml"
                          className="sr-only"
                          disabled={isBusy}
                          onChange={(event) => {
                            void importFile(event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                        {isBusy ? (
                          <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                        )}
                        <span className="text-sm font-medium text-foreground">
                          {isBusy ? "Importing..." : "Drop a file here, or click to choose"}
                        </span>
                        <span className="text-xs text-muted-foreground">.html or .svg, up to 500 KB</span>
                      </label>
                      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
                    </div>
                    <DevicePicker
                      value={deviceType}
                      onChange={setDeviceType}
                      disabled={isBusy}
                      hint="SVG files keep their own size."
                    />
                  </>
                ) : null}

                {source === "live_app" || source === "figma" ? (
                  <Field id={fieldId} label={source === "live_app" ? "Page URL" : "Figma frame link"} error={null}>
                    <input
                      id={fieldId}
                      autoFocus
                      value={link}
                      onChange={(event) => {
                        setLink(event.target.value);
                        setCopied(false);
                      }}
                      placeholder={source === "live_app" ? "http://localhost:3000/dashboard" : "https://www.figma.com/design/..."}
                      className={inputClass}
                    />
                  </Field>
                ) : null}

                {isAgentSource ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Prompt for your agent</p>
                    <p className="select-all rounded-lg border border-border bg-foreground/[0.03] p-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
                      {prompt}
                    </p>
                    {error ? <p className="text-xs text-destructive">{error}</p> : null}
                  </div>
                ) : null}
              </div>

              <footer className="flex items-center gap-3 border-t border-border bg-foreground/[0.02] px-6 py-4">
                <p className="mr-auto text-xs text-muted-foreground">
                  {source === "website"
                    ? isBusy
                      ? "Loading the page. This can take 30 seconds."
                      : "Public pages only."
                    : isAgentSource
                      ? "Paste it into Claude Code, Cursor, or Codex."
                      : "Imports stay editable and commentable."}
                </p>
                <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => pick(null)} className="active:scale-[0.98]">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
                {source === "website" ? (
                  <Button size="sm" disabled={!link.trim() || isBusy} onClick={() => void importWebsite()} className="min-w-28 active:scale-[0.98]">
                    {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                    {isBusy ? "Importing" : "Import page"}
                  </Button>
                ) : null}
                {isAgentSource ? (
                  <Button size="sm" onClick={() => void copyPrompt()} className="min-w-28 active:scale-[0.98]">
                    <MorphIcon icon={copied ? Check : Copy} className="h-3.5 w-3.5" />
                    {copied ? "Copied" : "Copy prompt"}
                  </Button>
                ) : null}
              </footer>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 aria-[invalid=true]:border-destructive";

function SourceGroup({
  label,
  sources,
  onPick,
}: {
  label: string;
  sources: SourceInfo[];
  onPick: (source: Source) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h3>
      <ul className="overflow-hidden rounded-lg border border-border">
        {sources.map(({ id, title, summary, icon: Icon }, index) => (
          <li key={id} className={cn(index > 0 && "border-t border-border")}>
            <button
              type="button"
              onClick={() => onPick(id)}
              className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border">
                <Icon className="h-4 w-4 text-foreground" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="block truncate text-xs text-muted-foreground">{summary}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error: string | null; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function DevicePicker({
  value,
  onChange,
  disabled,
  hint,
}: {
  value: "desktop" | "mobile";
  onChange: (value: "desktop" | "mobile") => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-foreground">Frame</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div role="radiogroup" aria-label="Frame" className="flex rounded-lg border border-border p-0.5">
        {(["desktop", "mobile"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60",
              value === option ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "desktop" ? "Desktop" : "Mobile"}
          </button>
        ))}
      </div>
    </div>
  );
}
