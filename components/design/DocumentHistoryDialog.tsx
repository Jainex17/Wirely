"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

interface DocumentVersion {
  id: string;
  createdAt: string;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Earlier states of the Design tab's document, and a restore that saves the
 * current state to this same list first, so a restore can be undone. A
 * restore is a new version on the server; `onRestored` asks the open editor to
 * load it now, and other open tabs load it on their next poll.
 */
export default function DocumentHistoryDialog({
  projectId,
  open,
  onOpenChange,
  onRestored,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const baseUrl = `/api/projects/${projectId}/document/versions`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setVersions(null);
    setSelectedId(null);
    void (async () => {
      try {
        const response = await fetch(baseUrl, { cache: "no-store" });
        const payload = (await response.json()) as { versions?: DocumentVersion[] };
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

  const restore = async () => {
    if (!selectedId || isRestoring) return;
    setIsRestoring(true);
    try {
      const response = await fetch(`${baseUrl}/${selectedId}`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { version?: number; error?: string } | null;
      if (!response.ok || typeof payload?.version !== "number") {
        throw new Error(payload?.error || "Could not restore this version.");
      }
      onRestored();
      toast.success("Version restored. The replaced design is saved in history.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore this version.");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Design history</DialogTitle>
          <DialogDescription>
            Wirely saves the design before a round of edits, at most every 3 minutes, and keeps up to the last 10.
          </DialogDescription>
        </DialogHeader>
        {versions === null ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No earlier versions yet. One appears here after the design changes.</p>
        ) : (
          <>
            <ol className="max-h-72 overflow-y-auto">
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(version.id)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm",
                      version.id === selectedId ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    {formatTime(version.createdAt)}
                  </button>
                </li>
              ))}
            </ol>
            <div className="flex justify-end">
              <Button onClick={() => void restore()} disabled={!selectedId || isRestoring}>
                {isRestoring ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Restore this version
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
