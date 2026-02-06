"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
    if (trimmedPrompt) {
      sessionStorage.setItem(`wirePrompt:${id}`, trimmedPrompt);
    }
    router.push(`/wire/${id}`);
  };

  return (
    <main className="relative overflow-hidden bg-background text-foreground">
      <div className="relative h-[90vh] z-10 flex flex-col items-center justify-center px-6 pb-16 pt-24">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            Let&apos;s build something, jainex.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-foreground/70 md:text-lg">
            Describe your next launch, and we&apos;ll draft three bold directions
            grounded in your palette.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 w-full max-w-3xl">
            <div className="glass-panel flex flex-col gap-3 rounded-3xl px-4 py-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-none border-0 bg-transparent px-2 text-base text-foreground placeholder:text-foreground/50 focus:outline-none focus:border-transparent focus-visible:ring-0 overflow-hidden"
              />

              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 rounded-full px-5 text-sm"
                >
                  {isSubmitting ? "Starting..." : "Submit"}
                </Button>
              </div>
            </div>
          </form>
        </div>

      </div>
    </main>
  );
}
