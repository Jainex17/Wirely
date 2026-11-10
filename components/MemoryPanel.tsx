"use client";

import { type ReactNode, useEffect, useState } from "react";
import DesignTokensDialog from "@/components/DesignTokensDialog";
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
import type { DesignTokens } from "@/lib/designTokens";
import { MAX_CONTEXT_CHARS, type ProjectMemory } from "@/lib/projectMemory";

type MemoryField = "context" | "rules";

const FIELD_COPY = {
  context: {
    title: "Project context",
    description: "What the product is, who uses it, and how it should feel. Every agent reads it before designing here.",
    placeholder: "A budgeting app for freelancers. Calm, plain, and dense with numbers.",
  },
  rules: {
    title: "Rules",
    description: "Style rules every agent follows here, one per line.",
    placeholder: "Square corners on every card\nNo gradients\nNumbers in tabular figures",
  },
} as const;

const toDraft = (memory: ProjectMemory, field: MemoryField) =>
  field === "context" ? memory.context : memory.rules.join("\n");

/**
 * The right panel's Memory tab: the project context, the style rules, and the
 * design tokens every agent reads with get_memory before it designs here.
 * Each section opens a dialog to edit it. Agents can change the context and
 * rules too, with set_memory.
 */
export default function MemoryPanel({ projectId }: { projectId: string }) {
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const [tokens, setTokens] = useState<DesignTokens>({});
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<MemoryField | null>(null);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTokensOpen, setIsTokensOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [memoryResponse, tokensResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}/memory`, { cache: "no-store" }),
          fetch(`/api/projects/${projectId}/tokens`, { cache: "no-store" }),
        ]);
        if (!memoryResponse.ok || !tokensResponse.ok) throw new Error("memory load failed");
        const loaded = (await memoryResponse.json()) as ProjectMemory;
        const tokensPayload = (await tokensResponse.json()) as { tokens?: DesignTokens };
        if (cancelled) return;
        setMemory(loaded);
        setTokens(tokensPayload.tokens ?? {});
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!memory) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground">
        {failed ? "Could not load memory." : "Loading memory..."}
      </p>
    );
  }

  const openEditor = (field: MemoryField) => {
    setDraft(toDraft(memory, field));
    setEditing(field);
  };

  const save = async () => {
    if (!editing) return;
    // Only the edited field goes up, so an agent's change to the other one
    // since this tab loaded is kept.
    const next = editing === "context" ? { context: draft } : { rules: draft.split("\n") };
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/memory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = (await response.json().catch(() => null)) as (ProjectMemory & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "Could not save memory.");
      setMemory({ context: payload.context, rules: payload.rules });
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save memory.");
    } finally {
      setIsSaving(false);
    }
  };

  const tokenEntries = Object.entries(tokens);
  const copy = editing ? FIELD_COPY[editing] : null;

  return (
    <div className="pb-4">
      <p className="border-b border-sidebar-border px-3 py-3 text-xs text-muted-foreground">
        Every agent reads this before it designs in this project.
      </p>

      <Section title="Project context" onEdit={() => openEditor("context")}>
        {memory.context ? (
          <p className="whitespace-pre-wrap text-xs text-foreground">{memory.context}</p>
        ) : (
          <p className="text-xs text-muted-foreground">What the product is, who uses it, and how it should feel.</p>
        )}
      </Section>

      <Section title="Rules" onEdit={() => openEditor("rules")}>
        {memory.rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Style rules every agent follows here, like &quot;Square corners on every card&quot;.
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-xs text-foreground">
            {memory.rules.map((rule, index) => (
              <li key={`${index}:${rule}`}>{rule}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Design tokens" onEdit={() => setIsTokensOpen(true)}>
        {tokenEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            CSS variables written into every frame. Your agent can set them from your codebase.
          </p>
        ) : (
          <ul className="space-y-1">
            {tokenEntries.map(([name, value]) => (
              <li key={name} className="flex items-center gap-2 text-xs">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded border border-border"
                  style={{ background: CSS.supports("color", value) ? value : "transparent" }}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">{name}</span>
                <span className="max-w-[45%] truncate font-mono text-muted-foreground">{value}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !isSaving && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {copy ? (
            <>
              <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
              </DialogHeader>
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={editing === "context" ? MAX_CONTEXT_CHARS : undefined}
                placeholder={copy.placeholder}
                className="h-64 w-full resize-none rounded-md border border-input bg-background p-3 text-sm"
              />
              <DialogFooter>
                <Button variant="outline" disabled={isSaving} onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button disabled={isSaving} onClick={() => void save()}>
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <DesignTokensDialog
        projectId={projectId}
        open={isTokensOpen}
        onOpenChange={setIsTokensOpen}
        onSaved={setTokens}
      />
    </div>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="border-b border-sidebar-border px-3 py-3">
      <div className="mb-2 flex h-6 items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-6 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
        >
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}
