"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/app/store/useEditorStore";
import {
  normalizeGeneratedHtml,
  parseWireOutput,
  userExplicitlyRequestedImages,
} from "@/app/lib/wireOutput";
import { evaluateWireHtmlQuality } from "@/app/lib/wireQuality";
import { selectWireStylePreset } from "@/app/lib/wirePrompt";

interface WirePromptSidebarProps {
  wireId: string;
  variant?: "floating" | "panel";
}

type RepairResponse = {
  content?: string;
  fallbackUsed?: boolean;
  stylePresetId?: string;
  modelName?: string;
};

export default function WirePromptSidebar({
  wireId,
  variant = "floating",
}: WirePromptSidebarProps) {
  const [prompt, setPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const autoRunRef = useRef(false);
  const latestPromptRef = useRef("");
  const setPageHtml = useEditorStore((state) => state.setPageHtml);

  const {
    messages,
    append,
    isLoading,
    stop,
  } = useChat({
    api: `/api/wire/${wireId}`,
    body: { wireId },
    onResponse: async (response) => {
      if (!response.ok) {
        const text = await response.text();
        setErrorMessage(
          text?.trim() || "Can't process request due to insufficient funds.",
        );
        stop();
        return;
      }
      setErrorMessage(null);
    },
    onError: () => {
      setErrorMessage("Can't process request due to insufficient funds.");
      stop();
    },
    onFinish: async (message) => {
      const targetPageId = useEditorStore.getState().pages[0]?.id;
      if (!targetPageId) return;

      const activePrompt = latestPromptRef.current;
      const allowImages = userExplicitlyRequestedImages(activePrompt);
      const stylePreset = selectWireStylePreset({
        wireId,
        userPrompt: activePrompt,
      });

      const initialParsed = parseWireOutput(message.content);
      const initialNormalized = normalizeGeneratedHtml(initialParsed.html, {
        allowImages,
      });
      const initialQuality = evaluateWireHtmlQuality({
        html: initialNormalized.html,
        allowImages,
        userPrompt: activePrompt,
        stylePresetId: stylePreset.id,
      });

      if (!initialQuality.isRenderable) {
        setErrorMessage("Generated output was not renderable. Try a more specific prompt.");
        return;
      }

      setPageHtml(targetPageId, initialNormalized.html, "Generated Page");
      setQualityNotice(null);

      console.info("[wire] quality_gate", {
        stage: "initial",
        score: initialQuality.score,
        needsRepair: initialQuality.needsRepair,
        violationCount: initialQuality.violations.length,
      });

      if (!initialQuality.needsRepair) {
        return;
      }

      setIsPolishing(true);
      try {
        const repairResponse = await fetch(`/api/wire/${wireId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            wireId,
            mode: "repair",
            messages: [{ role: "user", content: activePrompt }],
            draftHtml: initialNormalized.html,
            qualityContext: {
              stylePresetId: stylePreset.id,
              violations: initialQuality.violations,
            },
          }),
        });

        if (!repairResponse.ok) {
          throw new Error("Repair request failed.");
        }

        const payload = (await repairResponse.json()) as RepairResponse;
        const repairedParsed = parseWireOutput(payload.content ?? "");
        const repairedNormalized = normalizeGeneratedHtml(repairedParsed.html, {
          allowImages,
        });
        const repairedQuality = evaluateWireHtmlQuality({
          html: repairedNormalized.html,
          allowImages,
          userPrompt: activePrompt,
          stylePresetId: payload.stylePresetId ?? stylePreset.id,
        });

        console.info("[wire] quality_gate", {
          stage: "repair",
          score: repairedQuality.score,
          isRenderable: repairedQuality.isRenderable,
          fallbackUsed: !!payload.fallbackUsed,
          violationCount: repairedQuality.violations.length,
        });

        const shouldUseRepairedVersion =
          repairedQuality.isRenderable &&
          repairedQuality.score >= initialQuality.score;

        if (shouldUseRepairedVersion) {
          setPageHtml(targetPageId, repairedNormalized.html, "Generated Page");
        }

        if (!shouldUseRepairedVersion || payload.fallbackUsed) {
          setQualityNotice(
            "Auto-polish fallback kept output stable; regenerate for a different direction.",
          );
        }
      } catch {
        setQualityNotice(
          "Rendered normalized draft after repair fallback.",
        );
      } finally {
        setIsPolishing(false);
      }
    },
  });

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isLoading || isPolishing) return;
      const trimmed = prompt.trim();
      if (!trimmed) return;

      latestPromptRef.current = trimmed;
      setQualityNotice(null);
      setPrompt("");
      await append({ role: "user", content: trimmed });
    },
    [append, isLoading, isPolishing, prompt],
  );

  useEffect(() => {
    if (autoRunRef.current) return;
    const storedPrompt = sessionStorage.getItem(`wirePrompt:${wireId}`);
    if (!storedPrompt) return;
    autoRunRef.current = true;
    latestPromptRef.current = storedPrompt;
    sessionStorage.removeItem(`wirePrompt:${wireId}`);
    setPrompt("");
    void append({ role: "user", content: storedPrompt });
  }, [append, wireId]);

  const containerClassName =
    variant === "panel"
      ? "h-full w-full p-4 flex flex-col gap-4 bg-transparent text-neutral-100"
      : "fixed right-5 top-5 bottom-5 w-80 p-4 flex flex-col gap-4 bg-transparent text-neutral-100";

  const renderedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const key = message.id ?? `${message.role}-${index}`;
      if (message.role === "user") {
        return (
          <div
            key={key}
            className="ml-auto max-w-[85%] rounded-2xl bg-neutral-200 text-neutral-900 px-4 py-3 text-sm"
          >
            {message.content}
          </div>
        );
      }

      if (message.role === "assistant") {
        const details = parseWireOutput(message.content).details;
        if (!details) return null;
        return (
          <div
            key={key}
            className="max-w-[85%] rounded-2xl bg-neutral-800/60 px-4 py-3 text-sm text-neutral-100"
          >
            {details}
          </div>
        );
      }

      return null;
    });
  }, [messages]);

  return (
    <aside className={containerClassName}>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {renderedMessages}
        {errorMessage ? (
          <div className="max-w-[85%] rounded-2xl bg-neutral-800/60 px-4 py-3 text-sm text-neutral-100">
            {errorMessage}
          </div>
        ) : null}
        {isLoading ? (
          <div className="max-w-[85%] rounded-2xl bg-neutral-800/40 px-4 py-3 text-sm text-neutral-200">
            Generating...
          </div>
        ) : null}
        {isPolishing ? (
          <div className="max-w-[85%] rounded-2xl bg-neutral-800/40 px-4 py-3 text-sm text-neutral-200">
            Polishing design...
          </div>
        ) : null}
        {qualityNotice ? (
          <div className="max-w-[85%] rounded-2xl bg-neutral-800/50 px-4 py-3 text-sm text-neutral-300">
            {qualityNotice}
          </div>
        ) : null}
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
          disabled={isLoading || isPolishing}
          className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full p-0 bg-neutral-200 text-neutral-900 hover:bg-white"
          aria-label="Send"
        >
          {isLoading || isPolishing ? "…" : "→"}
        </Button>
      </form>
    </aside>
  );
}
