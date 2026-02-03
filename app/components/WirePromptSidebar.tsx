"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface WirePromptSidebarProps {
  wireId: string;
  promptPrefill?: string;
  variant?: "floating" | "panel";
}

export default function WirePromptSidebar({
  wireId,
  promptPrefill,
  variant = "floating",
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

  const containerClassName =
    variant === "panel"
      ? "h-full w-full p-4 flex flex-col gap-4 bg-transparent text-neutral-100"
      : "fixed right-5 top-5 bottom-5 w-80 p-4 flex flex-col gap-4 bg-transparent text-neutral-100";

  return (
    <aside className={containerClassName}>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        <div className="max-w-[85%] rounded-2xl bg-neutral-800/60 px-4 py-3 text-sm text-neutral-100">
          Share what you want to build. I will iterate the layout, copy, and vibe in
          real time.
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl bg-neutral-200 text-neutral-900 px-4 py-3 text-sm">
          A clean login page with a soft neutral palette and calm typography.
        </div>
        <div className="max-w-[85%] rounded-2xl bg-neutral-800/60 px-4 py-3 text-sm text-neutral-100">
          Got it. I will keep the layout minimal, emphasize form clarity, and soften
          the background and button accents.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask a follow-up..."
          rows={4}
          className="w-full resize-none bg-neutral-900/60 border border-white/10 text-neutral-100 placeholder:text-neutral-500 rounded-2xl px-4 py-3 pr-12 leading-5 focus:outline-none focus:ring-2 focus:ring-white/10"
        />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full p-0 bg-neutral-200 text-neutral-900 hover:bg-white"
          aria-label="Send"
        >
          {isSubmitting ? "…" : "→"}
        </Button>
      </form>
    </aside>
  );
}
