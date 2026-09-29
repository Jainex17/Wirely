"use client";

import React from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { type DesignTokens, formatTokenLines, parseTokenLines } from "@/lib/designTokens";

/**
 * Shows and edits the project's design tokens. An agent usually sets them
 * over MCP from the user's codebase; this is where the user sees them and can
 * change or clear them. Saving rewrites every page, which the editor's page
 * poll then picks up.
 */
export default function DesignTokensDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/tokens`, { cache: "no-store" });
        const payload = (await response.json()) as { tokens?: DesignTokens };
        if (!cancelled) setText(formatTokenLines(payload.tokens ?? {}));
      } catch {
        if (!cancelled) toast.error("Could not load design tokens.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const parsed = parseTokenLines(text);

  const save = async (tokens: DesignTokens) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tokens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Could not save design tokens.");
      toast.success(
        Object.keys(tokens).length > 0 ? "Tokens saved to every page." : "Tokens removed.",
      );
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save design tokens.");
    } finally {
      setIsSaving(false);
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
          onClick={() => setOpen(true)}
        >
          <Palette className="h-3.5 w-3.5" />
          Tokens
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Design tokens</DialogTitle>
            <DialogDescription>
              CSS variables written into every page, one per line. Pages use them as
              var(--name). Your agent can set these from your codebase.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={isLoading}
            spellCheck={false}
            placeholder={"--color-primary: #4f46e5;\n--radius-md: 8px;\n--font-sans: Inter, sans-serif;"}
            className="h-64 w-full resize-none rounded-md border border-input bg-background p-3 font-mono text-xs"
          />
          {parsed.ok ? (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(parsed.tokens)
                .filter(([, value]) => CSS.supports("color", value))
                .map(([name, value]) => (
                  <span
                    key={name}
                    title={`${name}: ${value}`}
                    className="h-5 w-5 rounded border border-border"
                    style={{ background: value }}
                  />
                ))}
            </div>
          ) : (
            <p className="text-xs text-destructive">{parsed.error}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSaving || isLoading}
              onClick={() => void save({})}
            >
              Remove all
            </Button>
            <Button
              disabled={!parsed.ok || isSaving || isLoading}
              onClick={() => parsed.ok && void save(parsed.tokens)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
