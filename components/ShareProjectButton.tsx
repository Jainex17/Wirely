"use client";

import { useState } from "react";
import { Copy, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";

type ShareState = { status: "loading" } | { status: "ready"; url: string | null };

/**
 * Turns the project's review link on and off. Anyone signed in to Wirely with
 * the link can see every page and pin comments, which show on the canvas.
 */
export default function ShareProjectButton({ projectId }: { projectId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [share, setShare] = useState<ShareState>({ status: "loading" });
  const [isBusy, setIsBusy] = useState(false);

  const request = async (method: "GET" | "POST" | "DELETE") => {
    const response = await fetch(`/api/projects/${projectId}/share`, { method, cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { url?: string | null; error?: string }
      | null;
    if (!response.ok) throw new Error(payload?.error || "Could not update the review link.");
    setShare({ status: "ready", url: payload?.url ?? null });
  };

  const run = async (method: "POST" | "DELETE") => {
    setIsBusy(true);
    try {
      await request(method);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the review link.");
    } finally {
      setIsBusy(false);
    }
  };

  const open = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) return;
    setShare({ status: "loading" });
    request("GET").catch((error: unknown) => {
      setIsOpen(false);
      toast.error(error instanceof Error ? error.message : "Could not load the review link.");
    });
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Review link copied.");
    } catch {
      toast.error("Could not copy the link. Check clipboard permissions.");
    }
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-sidebar p-0.5 shadow-lg">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => open(true)}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
      </div>
      <Dialog open={isOpen} onOpenChange={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share for review</DialogTitle>
            <DialogDescription>
              Anyone signed in to Wirely with this link can see every page and leave comments.
              Comments show as pins on your canvas.
            </DialogDescription>
          </DialogHeader>
          {share.status === "loading" ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : share.url ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={share.url} aria-label="Review link" onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" onClick={() => void copy(share.url ?? "")}>
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void run("DELETE")}
              >
                Turn off link
              </Button>
              <p className="text-xs text-muted-foreground">
                Turning the link off keeps the comments. Turning it on again makes a new link.
              </p>
            </div>
          ) : (
            <Button type="button" disabled={isBusy} onClick={() => void run("POST")}>
              {isBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create review link
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
