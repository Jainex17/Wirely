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
import type { Message } from "ai";
import {
  Plus,
  Send,
  ChevronDown,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/app/store/useEditorStore";
import {
  normalizeGeneratedHtml,
  parseBatchWireOutput,
  parseWireOutput,
  userExplicitlyRequestedImages,
} from "@/app/lib/wireOutput";
import { evaluateWireHtmlQuality } from "@/app/lib/wireQuality";
import { selectWireStylePreset } from "@/app/lib/wirePrompt";
import {
  DEFAULT_WIRE_MODEL,
  WIRE_MODEL_OPTIONS,
  isWireModelName,
  type WireModelName,
} from "@/app/lib/wireModels";

interface WirePromptSidebarProps {
  wireId: string;
  variant?: "floating" | "panel";
  initialModelName?: WireModelName;
  initialMessages?: Message[];
}

const VARIATION_THEME_HINTS = [
  "Editorial minimal layout with restrained monochrome palette and precise typography.",
  "Bold geometric composition with high contrast neon accents and kinetic visual rhythm.",
  "Warm handcrafted aesthetic with organic forms, textured surfaces, and soft tones.",
] as const;

const clampPageCount = (value: unknown): 1 | 2 | 3 => {
  if (typeof value !== "number" || !Number.isInteger(value)) return 1;
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return 2;
};

const parseStoredPageCount = (raw: string | null): 1 | 2 | 3 => {
  if (!raw) return 1;
  return clampPageCount(Number.parseInt(raw, 10));
};

const CHART_ICON_QUALITY_FAILURE_MESSAGE =
  "Generated dashboard output is missing real charts or SVG icons, or still contains chart placeholders. Regenerate with stricter chart output.";

const hasChartIconQualityViolation = (violations: string[]) =>
  violations.some((violation) =>
    [
      "chart_placeholder_detected",
      "missing_chart_render_signal",
      "missing_svg_icon_signal",
      "emoji_icon_overuse_dashboard",
    ].includes(violation),
  );

const getPrimaryGeneratedHtml = (content: string) => {
  const parsedBatch = parseBatchWireOutput(content);
  const firstBatchHtml = parsedBatch.htmlByIndex.find(
    (candidate) => candidate.trim().length > 0,
  );
  if (firstBatchHtml) return firstBatchHtml;
  return parseWireOutput(content).html;
};

const getAssistantDetails = (content: string) => {
  const parsedBatch = parseBatchWireOutput(content);
  const hasBatchHtmlSections = parsedBatch.htmlByIndex.some(
    (candidate) => candidate.trim().length > 0,
  );
  if (hasBatchHtmlSections && parsedBatch.details) {
    return parsedBatch.details;
  }
  const singleDetails = parseWireOutput(content).details;
  const detailsWithoutHtmlMarker = singleDetails
    .replace(/\n?\s*HTML\s*:[\s\S]*$/i, "")
    .trim();
  if (detailsWithoutHtmlMarker) {
    return detailsWithoutHtmlMarker;
  }
  const htmlStart = singleDetails.search(/<!doctype html>|<html[\s>]/i);
  if (htmlStart >= 0) {
    return singleDetails.slice(0, htmlStart).trim();
  }
  return singleDetails;
};

export default function WirePromptSidebar({
  wireId,
  variant = "floating",
  initialModelName = DEFAULT_WIRE_MODEL,
  initialMessages = [],
}: WirePromptSidebarProps) {
  const [prompt, setPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);
  const [activeModelName, setActiveModelName] =
    useState<WireModelName>(initialModelName);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const autoRunRef = useRef(false);
  const latestPromptRef = useRef("");
  const pendingTargetPageIdRef = useRef<string | null>(null);
  const pendingCreatedPageIdRef = useRef<string | null>(null);
  const pendingBatchTargetPageIdsRef = useRef<string[] | null>(null);
  const pendingBatchCreatedPageIdsRef = useRef<string[]>([]);
  const pendingModelNameRef = useRef<WireModelName>(initialModelName);
  const pendingGenerationFailedRef = useRef(false);
  const pendingGenerationErrorRef = useRef<string | null>(null);

  const pages = useEditorStore((state) => state.pages);
  const setPageHtml = useEditorStore((state) => state.setPageHtml);
  const createPage = useEditorStore((state) => state.createPage);
  const deletePage = useEditorStore((state) => state.deletePage);

  const clearPendingGeneration = useCallback(() => {
    pendingTargetPageIdRef.current = null;
    pendingCreatedPageIdRef.current = null;
    pendingBatchTargetPageIdsRef.current = null;
    pendingBatchCreatedPageIdsRef.current = [];
  }, []);

  const rollbackPendingCreatedPages = useCallback(() => {
    const pageIdsToDelete = new Set<string>();
    if (pendingCreatedPageIdRef.current) {
      pageIdsToDelete.add(pendingCreatedPageIdRef.current);
    }
    for (const pageId of pendingBatchCreatedPageIdsRef.current) {
      pageIdsToDelete.add(pageId);
    }

    for (const pageId of pageIdsToDelete) {
      deletePage(pageId);
    }

    clearPendingGeneration();
  }, [clearPendingGeneration, deletePage]);

  const markPagesAsLoading = useCallback(
    (pageIds: string[]) => {
      for (const pageId of pageIds) {
        setPageHtml(pageId, "");
      }
    },
    [setPageHtml],
  );

  const { messages, append, isLoading, stop } = useChat({
    api: `/api/projects/${wireId}/generate`,
    body: { wireId, modelName: activeModelName },
    initialMessages,
    onResponse: async (response) => {
      if (!response.ok) {
        const text = await response.text();
        const failureMessage =
          text?.trim() ||
          `Generation failed with ${pendingModelNameRef.current}. Try another model.`;
        pendingGenerationFailedRef.current = true;
        pendingGenerationErrorRef.current = failureMessage;
        rollbackPendingCreatedPages();
        setErrorMessage(failureMessage);
        stop();
        return;
      }
      setErrorMessage(null);
    },
    onError: () => {
      const failureMessage = `Generation failed with ${pendingModelNameRef.current}. Try another model.`;
      pendingGenerationFailedRef.current = true;
      pendingGenerationErrorRef.current = failureMessage;
      rollbackPendingCreatedPages();
      setErrorMessage(failureMessage);
      stop();
    },
    onFinish: (message) => {
      try {
        const activePrompt = latestPromptRef.current;
        const allowImages = userExplicitlyRequestedImages(activePrompt);
        const stylePreset = selectWireStylePreset({
          wireId,
          userPrompt: activePrompt,
        });

        const batchTargetPageIds = pendingBatchTargetPageIdsRef.current;
        if (batchTargetPageIds && batchTargetPageIds.length > 1) {
          const parsedBatch = parseBatchWireOutput(message.content, batchTargetPageIds.length);
          let successCount = 0;
          let failedCount = 0;
          let chartIconFailureCount = 0;

          for (let index = 0; index < batchTargetPageIds.length; index += 1) {
            const targetPageId = batchTargetPageIds[index];
            const htmlCandidate = parsedBatch.htmlByIndex[index] ?? "";
            if (!htmlCandidate.trim()) {
              failedCount += 1;
              if (pendingBatchCreatedPageIdsRef.current.includes(targetPageId)) {
                deletePage(targetPageId);
              }
              continue;
            }

            const normalized = normalizeGeneratedHtml(htmlCandidate, {
              allowImages,
            });
            const quality = evaluateWireHtmlQuality({
              html: normalized.html,
              allowImages,
              userPrompt: activePrompt,
              stylePresetId: stylePreset.id,
            });

            if (!quality.isRenderable) {
              failedCount += 1;
              if (hasChartIconQualityViolation(quality.violations)) {
                chartIconFailureCount += 1;
              }
              if (pendingBatchCreatedPageIdsRef.current.includes(targetPageId)) {
                deletePage(targetPageId);
              }
              continue;
            }

            setPageHtml(targetPageId, normalized.html);
            successCount += 1;
          }

          if (successCount === 0) {
            const fallbackHtml = getPrimaryGeneratedHtml(message.content);
            const fallbackNormalized = normalizeGeneratedHtml(fallbackHtml, {
              allowImages,
            });
            const fallbackQuality = evaluateWireHtmlQuality({
              html: fallbackNormalized.html,
              allowImages,
              userPrompt: activePrompt,
              stylePresetId: stylePreset.id,
            });

            if (fallbackQuality.isRenderable) {
              setPageHtml(batchTargetPageIds[0], fallbackNormalized.html);
              successCount = 1;
            } else if (
              /<html[\s>]/i.test(fallbackNormalized.html) &&
              /<body[\s>]/i.test(fallbackNormalized.html)
            ) {
              setPageHtml(batchTargetPageIds[0], fallbackNormalized.html);
              failedCount = Math.max(0, failedCount - 1);
              successCount = 1;
            }
          }

          if (successCount > 0) {
            setQualityNotice(null);
          }

          if (failedCount > 0) {
            if (chartIconFailureCount > 0) {
              setErrorMessage(
                `${failedCount} of ${batchTargetPageIds.length} variations failed. ${CHART_ICON_QUALITY_FAILURE_MESSAGE}`,
              );
              return;
            }
            setErrorMessage(
              `${failedCount} of ${batchTargetPageIds.length} variations failed. ${successCount} generated successfully.`,
            );
          } else {
            setErrorMessage(null);
          }
          return;
        }

        const targetPageId =
          pendingTargetPageIdRef.current ?? useEditorStore.getState().pages[0]?.id;
        if (!targetPageId) {
          return;
        }

        const initialHtml = getPrimaryGeneratedHtml(message.content);
        const initialNormalized = normalizeGeneratedHtml(initialHtml, {
          allowImages,
        });
        const initialQuality = evaluateWireHtmlQuality({
          html: initialNormalized.html,
          allowImages,
          userPrompt: activePrompt,
          stylePresetId: stylePreset.id,
        });

        if (!initialQuality.isRenderable) {
          rollbackPendingCreatedPages();
          setErrorMessage(
            hasChartIconQualityViolation(initialQuality.violations)
              ? CHART_ICON_QUALITY_FAILURE_MESSAGE
              : "Generated output was not renderable. Try a more specific prompt.",
          );
          return;
        }

        setPageHtml(targetPageId, initialNormalized.html);
        setQualityNotice(null);
      } finally {
        pendingGenerationFailedRef.current = false;
        pendingGenerationErrorRef.current = null;
        clearPendingGeneration();
      }
    },
  });

  const startGenerationForPage = useCallback(
    async ({
      promptText,
      targetPageId,
      createdPageId,
      modelName,
      force,
    }: {
      promptText: string;
      targetPageId: string;
      createdPageId?: string;
      modelName?: WireModelName;
      force?: boolean;
    }) => {
      if (isLoading && !force) {
        return false;
      }

      const trimmedPrompt = promptText.trim();
      if (!trimmedPrompt) return false;

      const selectedModel = modelName ?? activeModelName;

      pendingTargetPageIdRef.current = targetPageId;
      pendingCreatedPageIdRef.current = createdPageId ?? null;
      pendingBatchTargetPageIdsRef.current = null;
      pendingBatchCreatedPageIdsRef.current = [];
      pendingModelNameRef.current = selectedModel;
      pendingGenerationFailedRef.current = false;
      pendingGenerationErrorRef.current = null;
      latestPromptRef.current = trimmedPrompt;
      setQualityNotice(null);
      setErrorMessage(null);

      const body: Record<string, unknown> = {
        modelName: selectedModel,
      };

      try {
        await append({ role: "user", content: trimmedPrompt }, { body });

        if (pendingGenerationFailedRef.current) {
          const failureMessage =
            pendingGenerationErrorRef.current ??
            `Generation failed with ${selectedModel}. Try another model.`;
          pendingGenerationFailedRef.current = false;
          pendingGenerationErrorRef.current = null;
          throw new Error(failureMessage);
        }

        return true;
      } catch (error) {
        rollbackPendingCreatedPages();
        throw error;
      }
    },
    [activeModelName, append, isLoading, rollbackPendingCreatedPages],
  );

  const startBatchGeneration = useCallback(
    async ({
      promptText,
      targetPageIds,
      createdPageIds,
      modelName,
    }: {
      promptText: string;
      targetPageIds: string[];
      createdPageIds: string[];
      modelName: WireModelName;
    }) => {
      if (isLoading) return false;
      const trimmedPrompt = promptText.trim();
      if (!trimmedPrompt || targetPageIds.length <= 1) return false;

      pendingTargetPageIdRef.current = null;
      pendingCreatedPageIdRef.current = null;
      pendingBatchTargetPageIdsRef.current = targetPageIds;
      pendingBatchCreatedPageIdsRef.current = createdPageIds;
      pendingModelNameRef.current = modelName;
      pendingGenerationFailedRef.current = false;
      pendingGenerationErrorRef.current = null;
      latestPromptRef.current = trimmedPrompt;
      setQualityNotice(null);
      setErrorMessage(null);
      markPagesAsLoading(targetPageIds);

      const body = {
        modelName,
        variationCount: targetPageIds.length,
        variationThemeHint: VARIATION_THEME_HINTS.slice(0, targetPageIds.length).join(
          " || ",
        ),
      };

      try {
        await append({ role: "user", content: trimmedPrompt }, { body });

        if (pendingGenerationFailedRef.current) {
          const failureMessage =
            pendingGenerationErrorRef.current ??
            `Generation failed with ${modelName}. Try another model.`;
          pendingGenerationFailedRef.current = false;
          pendingGenerationErrorRef.current = null;
          throw new Error(failureMessage);
        }

        return true;
      } catch (error) {
        rollbackPendingCreatedPages();
        throw error;
      }
    },
    [append, isLoading, markPagesAsLoading, rollbackPendingCreatedPages],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const targetPageId = selectedPageId ?? useEditorStore.getState().pages[0]?.id;
      if (!targetPageId) return;

      const generated = await startGenerationForPage({
        promptText: prompt,
        targetPageId,
      });

      if (generated) {
        setPrompt("");
      }
    },
    [prompt, selectedPageId, startGenerationForPage],
  );

  useEffect(() => {
    if (pages.length === 0) {
      setSelectedPageId(null);
      return;
    }

    if (!selectedPageId || !pages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(pages[0].id);
    }
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (autoRunRef.current) return;
    const autoRunTimerId = window.setTimeout(() => {
      if (autoRunRef.current) return;

      const storedModel = sessionStorage.getItem(`wireModel:${wireId}`);
      const resolvedModel = isWireModelName(storedModel)
        ? storedModel
        : activeModelName;
      if (isWireModelName(storedModel)) {
        setActiveModelName(storedModel);
      }

      const storedPrompt = sessionStorage.getItem(`wirePrompt:${wireId}`);
      const storedPageCount = parseStoredPageCount(
        sessionStorage.getItem(`wirePageCount:${wireId}`),
      );

      autoRunRef.current = true;
      sessionStorage.removeItem(`wireModel:${wireId}`);
      sessionStorage.removeItem(`wirePrompt:${wireId}`);
      sessionStorage.removeItem(`wirePageCount:${wireId}`);

      if (!storedPrompt) return;

      setPrompt("");

      const runInitialBatch = async () => {
        let firstPageId = useEditorStore.getState().pages[0]?.id;
        if (!firstPageId) {
          firstPageId = createPage("Page 1");
        }
        if (!firstPageId) return;

        const targets: Array<{ pageId: string; isCreated: boolean }> = [
          { pageId: firstPageId, isCreated: false },
        ];

        for (let index = 1; index < storedPageCount; index += 1) {
          const nextPageNumber = useEditorStore.getState().pages.length + 1;
          const createdId = createPage(`Page ${nextPageNumber}`);
          targets.push({ pageId: createdId, isCreated: true });
        }

        try {
          if (storedPageCount === 1) {
            await startGenerationForPage({
              promptText: storedPrompt,
              targetPageId: targets[0].pageId,
              modelName: resolvedModel,
              force: true,
            });
            return;
          }

          const targetPageIds = targets.map((target) => target.pageId);
          const createdPageIds = targets
            .filter((target) => target.isCreated)
            .map((target) => target.pageId);
          markPagesAsLoading(targetPageIds);

          await startBatchGeneration({
            promptText: storedPrompt,
            targetPageIds,
            createdPageIds,
            modelName: resolvedModel,
          });
        } catch {
          setErrorMessage(
            `Could not generate ${storedPageCount} pages in one request. Please try again.`,
          );
        }
      };

      void runInitialBatch();
    }, 0);

    return () => {
      window.clearTimeout(autoRunTimerId);
    };
  }, [
    activeModelName,
    createPage,
    markPagesAsLoading,
    startBatchGeneration,
    startGenerationForPage,
    wireId,
  ]);

  const containerClassName =
    variant === "panel"
      ? "h-full w-full p-4 flex flex-col gap-4 bg-transparent text-foreground"
      : "fixed right-5 top-5 bottom-5 w-80 p-4 flex flex-col gap-4 bg-transparent text-neutral-100";

  const renderedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const key = message.id ?? `${message.role}-${index}`;
      if (message.role === "user") {
        return (
          <div
            key={key}
            className={`ml-auto max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-primary text-primary-foreground"
                : "bg-neutral-200 text-neutral-900"
            }`}
          >
            {message.content}
          </div>
        );
      }

      if (message.role === "assistant") {
        const details = getAssistantDetails(message.content);
        if (!details) {
          return null;
        }
        return (
          <div
            key={key}
            className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              variant === "panel"
                ? "bg-muted text-foreground"
                : "bg-neutral-800/60 text-neutral-200"
            }`}
          >
            {details}
          </div>
        );
      }

      return null;
    });
  }, [messages, variant]);

  const selectedPageTitle =
    pages.find((page) => page.id === selectedPageId)?.title ?? "Select page";

  const geminiModelOptions = useMemo(
    () => WIRE_MODEL_OPTIONS.filter((model) => model.provider === "gemini"),
    [],
  );
  const openRouterModelOptions = useMemo(
    () => WIRE_MODEL_OPTIONS.filter((model) => model.provider === "openrouter"),
    [],
  );

  return (
    <aside className={containerClassName}>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {renderedMessages}
        {errorMessage ? (
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-destructive/10 text-destructive"
                : "bg-neutral-800/60 text-neutral-100"
            }`}
          >
            {errorMessage}
          </div>
        ) : null}
        {qualityNotice ? (
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-secondary text-secondary-foreground"
                : "bg-neutral-800/60 text-neutral-100"
            }`}
          >
            {qualityNotice}
          </div>
        ) : null}
        {isLoading ? (
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-muted text-muted-foreground"
                : "bg-neutral-800/40 text-neutral-200"
            }`}
          >
            Thinking...
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0">
        <div
          className={`relative flex min-h-[48px] w-full items-end overflow-hidden rounded-xl bg-neutral-900/60 pl-2 pr-1 shadow-2xl transition-all ${
            variant === "panel"
              ? "border-border bg-card"
              : "border border-white/10"
          }`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`flex h-8 w-8 shrink-0 items-center justify-center ${
              variant === "panel"
                ? "text-muted-foreground hover:bg-accent"
                : "text-neutral-400 hover:bg-white/10"
            }`}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask a follow-up..."
            rows={1}
            className={`mb-2 max-h-[200px] flex-1 resize-none bg-transparent py-3 text-sm focus:ring-2 focus:ring-neutral-500/50 focus:rounded-md ${
              variant === "panel"
                ? "text-foreground placeholder:text-muted-foreground/60"
                : "text-neutral-100 placeholder:text-neutral-500"
            }`}
          />
          <div className="mr-1 flex shrink-0 flex-col items-end justify-end gap-1 py-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`flex h-8 items-center gap-1 rounded-md px-2 text-xs ${
                    variant === "panel"
                      ? "text-muted-foreground hover:bg-accent"
                      : "text-neutral-400 hover:bg-white/10"
                  }`}
                >
                  <Circle className="h-3 w-3 text-primary" />
                  {WIRE_MODEL_OPTIONS.find((m) => m.id === activeModelName)
                    ?.label || activeModelName}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border">
                {geminiModelOptions.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => setActiveModelName(model.id)}
                  >
                    {model.label}
                  </DropdownMenuItem>
                ))}
                {openRouterModelOptions.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => setActiveModelName(model.id)}
                  >
                    {model.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`flex h-8 max-w-[170px] items-center gap-1 rounded-md px-2 text-xs ${
                    variant === "panel"
                      ? "text-muted-foreground hover:bg-accent"
                      : "text-neutral-400 hover:bg-white/10"
                  }`}
                >
                  <span className="truncate">Edit: {selectedPageTitle}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border">
                {pages.map((page) => (
                  <DropdownMenuItem
                    key={page.id}
                    onClick={() => setSelectedPageId(page.id)}
                  >
                    {page.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="submit"
              disabled={isLoading || !prompt.trim() || !selectedPageId}
              size="icon"
              className={`mb-1 mt-0.5 h-8 w-8 ${
                variant === "panel"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-20"
                  : "bg-white/10 text-neutral-200 hover:bg-white/20 disabled:opacity-20"
              }`}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </aside>
  );
}
