"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const createWireId = () => {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${time}${random}`;
};

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const placeholder = useMemo(
    () => "Describe the site you want to generate...",
    [],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    const id = createWireId();
    const trimmedPrompt = prompt.trim();
    const query = trimmedPrompt
      ? `?prompt=${encodeURIComponent(trimmedPrompt)}`
      : "";
    router.push(`/wire/${id}${query}`);
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-lg p-8 md:p-12">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            Openwire Studio
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold">
            Generate three design directions in seconds.
          </h1>
          <p className="text-muted-foreground">
            Drop in a prompt, get three layout options, and refine on the
            canvas.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-3 md:flex-row"
        >
          <Input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Starting..." : "Generate"}
          </Button>
        </form>
      </div>
    </main>
  );
}
