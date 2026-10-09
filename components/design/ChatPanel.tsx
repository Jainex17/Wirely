"use client";

import { ArrowUp, Check, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignGenerationEvent } from "@/lib/design/generation";
import { cn } from "@/lib/utils";

export interface ChatModel {
  id: string;
  label: string;
  tier: "free" | "paid";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

type Step = { label: string; status: "running" | "done" | "failed" };

/**
 * Chat tab: describe screens and a model on the user's own key builds them
 * on the canvas with the design tools. Screens appear as each one is
 * saved; the list here shows what the model is doing meanwhile. A prompt typed
 * on the home page goes to the HTML tab's chat, not here.
 */
export default function ChatPanel({
  projectId,
  models,
  initialMessages,
}: {
  projectId: string;
  models: ChatModel[];
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages.filter((message) => message.role !== "system"));
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [steps, setSteps] = useState<Step[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const run = useCallback(
    async (text: string, model: string) => {
      const trimmed = text.trim();
      if (!trimmed || isRunning) return;
      setIsRunning(true);
      setSteps([]);
      setPrompt("");
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
      const finish = (content: string) =>
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content }]);
      try {
        const response = await fetch(`/api/projects/${projectId}/design/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: trimmed, modelName: model || undefined }),
        });
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          finish(payload?.error ?? "Generation could not start. Try again.");
          return;
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as DesignGenerationEvent;
            if (event.type === "tool") setSteps((current) => [...current, { label: event.label, status: "running" }]);
            if (event.type === "tool-result") {
              setSteps((current) => {
                const index = current.findLastIndex((step) => step.status === "running");
                return index === -1
                  ? current
                  : current.map((step, at) => (at === index ? { ...step, status: event.ok ? "done" : "failed" } : step));
              });
            }
            if (event.type === "done") finish(event.summary);
            if (event.type === "error") finish(event.message);
          }
        }
      } catch {
        finish("The connection dropped. Screens finished so far are saved.");
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, projectId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, steps]);

  if (models.length === 0) {
    return (
      <div className="space-y-2 p-3 text-xs text-muted-foreground">
        <p>Connect your coding agent to design here, or add a model key to generate in Wirely.</p>
        <Link href="/setting?tab=providers" className="text-primary hover:underline">
          Add a key in Providers
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col text-xs">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && !isRunning ? (
          <p className="text-muted-foreground">
            Describe the screens you want, like &ldquo;three directions for a habit tracker dashboard, web&rdquo; or
            &ldquo;a mobile onboarding flow&rdquo;.
          </p>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "rounded-lg px-2.5 py-2 leading-relaxed",
              message.role === "user" ? "ml-6 bg-primary/15" : "mr-6 bg-background/60",
            )}
          >
            {message.content}
          </div>
        ))}
        {steps.length > 0 ? (
          <ul className="space-y-1 rounded-lg bg-background/40 px-2.5 py-2">
            {steps.map((step, index) => (
              <li key={index} className="flex items-center gap-1.5 text-muted-foreground">
                {step.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : step.status === "done" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <X className="h-3 w-3 text-rose-500" />
                )}
                {step.label}
              </li>
            ))}
          </ul>
        ) : null}
        {isRunning && steps.length === 0 ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Planning the screens…
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        className="space-y-1.5 border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(prompt, modelId);
        }}
      >
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void run(prompt, modelId);
            }
          }}
          rows={3}
          placeholder="Describe a screen or a change…"
          aria-label="Describe the screens to design"
          className="w-full resize-none rounded-md border border-border bg-background/60 p-2 outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Model"
            data-tip="Model"
            data-tip-detail="Runs on the key you saved in settings. Free models cost nothing."
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            className="min-w-0 flex-1 rounded-md bg-background/60 px-1.5 py-1 outline-none"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
                {model.tier === "free" ? " · free" : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isRunning || !prompt.trim()}
            aria-label="Send (Cmd+Enter)"
            data-tip-detail="The model builds the screens on the canvas"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
