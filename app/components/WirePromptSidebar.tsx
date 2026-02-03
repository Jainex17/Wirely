"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface WirePromptSidebarProps {
  wireId: string;
  promptPrefill?: string;
}

export default function WirePromptSidebar({
  wireId,
  promptPrefill,
}: WirePromptSidebarProps) {
  const [prompt, setPrompt] = useState(promptPrefill ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (promptPrefill !== undefined) {
      setPrompt(promptPrefill);
    }
  }, [promptPrefill]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 300);
    console.info("Wire prompt submitted", { wireId, prompt });
  };

  return (
    <aside className="fixed right-5 top-5 bottom-5 w-96 bg-card border border-border rounded-lg p-6 flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Adjust the layout, tone, or content..."
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Submit"}
        </Button>
      </form>
    </aside>
  );
}
