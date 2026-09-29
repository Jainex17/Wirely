"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/useEditorStore";

interface PageVersion {
  id: string;
  title: string;
  createdAt: string;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Earlier versions of one page with a preview, and a restore that snapshots
 * the current HTML first, so restoring can be undone from this same list.
 */
export default function PageHistoryDialog({
  projectId,
  pageId,
  pageTitle,
  open,
  onOpenChange,
}: {
  projectId: string;
  pageId: string;
  pageTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [versions, setVersions] = React.useState<PageVersion[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = React.useState("");
  const [isRestoring, setIsRestoring] = React.useState(false);
  const setPageHtml = useEditorStore((state) => state.setPageHtml);
  const baseUrl = `/api/projects/${projectId}/pages/${pageId}/versions`;

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setVersions(null);
    setSelectedId(null);
    void (async () => {
      try {
        const response = await fetch(baseUrl, { cache: "no-store" });
        const payload = (await response.json()) as { versions?: PageVersion[] };
        if (cancelled) return;
        setVersions(payload.versions ?? []);
        setSelectedId(payload.versions?.[0]?.id ?? null);
      } catch {
        if (!cancelled) setVersions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, open]);

  React.useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setPreviewHtml("");
    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/${selectedId}`, { cache: "no-store" });
        const payload = (await response.json()) as { html?: string };
        if (!cancelled) setPreviewHtml(payload.html ?? "");
      } catch {
        // The preview stays empty; restore still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, selectedId]);

  const restore = async () => {
    if (!selectedId || isRestoring) return;
    setIsRestoring(true);
    try {
      const response = await fetch(`${baseUrl}/${selectedId}`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { html?: string; error?: string }
        | null;
      if (!response.ok || payload?.html === undefined) {
        throw new Error(payload?.error || "Could not restore this version.");
      }
      setPageHtml(pageId, payload.html);
      toast.success("Version restored. The replaced design is saved in history.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore this version.");
    } finally {
      setIsRestoring(false);
    }
  };

  const previewSrcDoc = React.useMemo(() => sanitizeIframeHtml(previewHtml), [previewHtml]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-6rem)] w-[calc(100vw-6rem)] flex-col gap-4 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>History of {pageTitle}</DialogTitle>
          <DialogDescription>
            Wirely saves a page before each rewrite, keeping the last 20 versions.
          </DialogDescription>
        </DialogHeader>
        {versions === null ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No earlier versions yet. One appears here the next time this page is rewritten.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 gap-4">
            <ol className="w-44 shrink-0 overflow-y-auto">
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(version.id)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm",
                      version.id === selectedId
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    {formatTime(version.createdAt)}
                  </button>
                </li>
              ))}
            </ol>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <iframe
                title={`${pageTitle} earlier version`}
                srcDoc={previewSrcDoc}
                className="min-h-0 flex-1 rounded-lg border border-border bg-background"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
              />
              <div className="flex justify-end">
                <Button onClick={() => void restore()} disabled={!previewHtml || isRestoring}>
                  {isRestoring ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Restore this version
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
