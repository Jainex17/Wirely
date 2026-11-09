"use client";

import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { parseProjectTitle, PROJECT_TITLE_MAX_CHARS, saveProjectTitle } from "@/lib/projectTitle";

interface RenameProjectDialogProps {
  project: { id: string; title: string };
  onClose: () => void;
  onRenamed: (title: string) => void;
}

export default function RenameProjectDialog({ project, onClose, onRenamed }: RenameProjectDialogProps) {
  const [draft, setDraft] = useState(project.title);
  const [isSaving, setIsSaving] = useState(false);
  const title = parseProjectTitle(draft);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!title || isSaving) return;
    if (title === project.title) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      onRenamed(await saveProjectTitle(project.id, title));
      toast.success("Project renamed.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename the project.");
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-xl">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              Your agent finds the project by this name, so you can say &quot;add a page to {title ?? "it"}&quot;.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={draft}
            aria-label="Project name"
            maxLength={PROJECT_TITLE_MAX_CHARS}
            disabled={isSaving}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title || isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
