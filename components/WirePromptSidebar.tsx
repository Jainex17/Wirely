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
import Link from "next/link";
import { Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/store/useEditorStore";
import {
  normalizeGeneratedHtml,
  parseBatchWireOutput,
  parseWireOutput,
  userExplicitlyRequestedImages,
} from "@/lib/wireOutput";
import { evaluateWireHtmlQuality } from "@/lib/wireQuality";
import { selectWireStylePreset } from "@/lib/wirePrompt";
import {
  DEFAULT_ENABLED_WIRE_MODELS,
  DEFAULT_WIRE_MODEL,
  WIRE_MODEL_OPTIONS,
  isWireModelName,
  normalizeEnabledWireModels,
  type WireModelName,
} from "@/lib/wireModels";
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";
import GeminiIcon from "@/components/icons/GeminiIcon";

interface WirePromptSidebarProps {
  wireId: string;
  variant?: "floating" | "panel";
  initialModelName?: WireModelName;
  initialMessages?: Message[];
}

interface AiSettingsResponse {
  enabledModelIds: WireModelName[];
}

interface CompactHistoryMessage {
  role: "user" | "assistant";
  content: string;
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

const GENERATION_FAILURE_PREVIEW_HTML = [
  "<!doctype html>",
  '<html lang="en">',
  "<head>",
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  "<title>Generation failed</title>",
  "</head>",
  "<body>",
  "<main>",
  "<h1>Generation could not be completed</h1>",
  "<p>The latest response could not be rendered for this page.</p>",
  "<p>Try regenerating with a more specific prompt.</p>",
  "</main>",
  "</body>",
  "</html>",
].join("");

const hasChartIconQualityViolation = (violations: string[]) =>
  violations.some((violation) =>
    [
      "chart_placeholder_detected",
      "missing_chart_render_signal",
      "missing_svg_icon_signal",
      "emoji_icon_overuse_dashboard",
    ].includes(violation),
  );

const normalizeGenerationErrorMessage = ({
  error,
  modelName,
}: {
  error: unknown;
  modelName: WireModelName;
}) => {
  const fallback = `Generation failed with ${modelName}. Try another model.`;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim();

  if (!message) return fallback;
  if (/aborted|cancelled|network|fetch failed|stream closed/i.test(message)) {
    return "Generation stream closed early. Retry, or switch to Gemini 2.5 Flash Lite.";
  }
  if (/quota|rate limit|resource exhausted|429|too many requests/i.test(message)) {
    return "Gemini quota/rate limit reached. Retry later or switch to Gemini 2.5 Flash Lite.";
  }
  if (/deadline|timeout|max duration/i.test(message)) {
    return "Generation timed out on the server. Retry with a shorter prompt or use Gemini 2.5 Flash Lite.";
  }
  if (/api key|permission|unauthorized|403|401/i.test(message)) {
    return "Google API key is invalid or missing required access for this model.";
  }

  return message;
};

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

const MAX_COMPACT_HISTORY_MESSAGES = 12;

const compactHistoryFromMessages = (
  messages: Message[],
): CompactHistoryMessage[] => {
  const compact: CompactHistoryMessage[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    if (typeof message.content !== "string") {
      continue;
    }

    const content =
      message.role === "assistant"
        ? getAssistantDetails(message.content) || "Generated an updated page."
        : message.content.trim();
    if (!content) continue;

    compact.push({ role: message.role, content });
  }

  return compact.slice(-MAX_COMPACT_HISTORY_MESSAGES);
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
  const [enabledModelIds, setEnabledModelIds] = useState<WireModelName[]>([
    ...DEFAULT_ENABLED_WIRE_MODELS,
  ]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const autoRunRef = useRef(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const latestPromptRef = useRef("");
  const pendingTargetPageIdRef = useRef<string | null>(null);
  const pendingCreatedPageIdRef = useRef<string | null>(null);
  const pendingBatchTargetPageIdsRef = useRef<string[] | null>(null);
  const pendingBatchCreatedPageIdsRef = useRef<string[]>([]);
  const pendingPageHtmlBackupRef = useRef<Map<string, string>>(new Map());
  const pendingModelNameRef = useRef<WireModelName>(initialModelName);
  const pendingGenerationFailedRef = useRef(false);
  const pendingGenerationErrorRef = useRef<string | null>(null);
  const hasShownErrorToastRef = useRef(false);

  const pages = useEditorStore((state) => state.pages);
  const setPageHtml = useEditorStore((state) => state.setPageHtml);
  const createPageLocal = useEditorStore((state) => state.createPage);
  const deletePageLocal = useEditorStore((state) => state.deletePage);

  const clearPendingGeneration = useCallback(() => {
    pendingTargetPageIdRef.current = null;
    pendingCreatedPageIdRef.current = null;
    pendingBatchTargetPageIdsRef.current = null;
    pendingBatchCreatedPageIdsRef.current = [];
    pendingPageHtmlBackupRef.current.clear();
  }, []);

  const reportError = useCallback((message: string) => {
    setErrorMessage(message);
    if (!hasShownErrorToastRef.current) {
      toast.error(message);
      hasShownErrorToastRef.current = true;
    }
  }, []);

  const persistPageUpdate = useCallback(
    async (
      pageId: string,
      payload: { title?: string; htmlContent?: string },
    ) => {
      const response = await fetch(`/api/projects/${wireId}/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Page persistence failed with status ${response.status}`,
        );
      }
    },
    [wireId],
  );

  const persistPageHtml = useCallback(
    async (pageId: string, htmlContent: string) => {
      await persistPageUpdate(pageId, { htmlContent });
    },
    [persistPageUpdate],
  );

  const createPageOnServer = useCallback(
    async (title: string) => {
      const response = await fetch(`/api/projects/${wireId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        throw new Error(`Page creation failed with status ${response.status}`);
      }
      const payload = (await response.json()) as {
        page?: { id: string; title: string };
      };
      if (!payload.page) {
        throw new Error("Page creation response missing page payload.");
      }
      return payload.page;
    },
    [wireId],
  );

  const deletePageOnServer = useCallback(
    async (pageId: string) => {
      const response = await fetch(`/api/projects/${wireId}/pages/${pageId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Page deletion failed with status ${response.status}`);
      }
    },
    [wireId],
  );

  const rollbackPendingCreatedPages = useCallback(() => {
    const pageIdsToDelete = new Set<string>();
    if (pendingCreatedPageIdRef.current) {
      pageIdsToDelete.add(pendingCreatedPageIdRef.current);
    }
    for (const pageId of pendingBatchCreatedPageIdsRef.current) {
      pageIdsToDelete.add(pageId);
    }

    for (const [pageId, previousHtml] of pendingPageHtmlBackupRef.current) {
      if (pageIdsToDelete.has(pageId)) {
        continue;
      }
      setPageHtml(
        pageId,
        previousHtml.trim().length > 0
          ? previousHtml
          : GENERATION_FAILURE_PREVIEW_HTML,
      );
    }

    for (const pageId of pageIdsToDelete) {
      deletePageLocal(pageId);
      void deletePageOnServer(pageId).catch((error) => {
        logger.error("wire_rollback_delete_failed", { pageId, error });
      });
    }

    clearPendingGeneration();
  }, [
    clearPendingGeneration,
    deletePageLocal,
    deletePageOnServer,
    setPageHtml,
  ]);

  const snapshotCurrentPageHtml = useCallback((pageIds: string[]) => {
    const pagesById = new Map(
      useEditorStore.getState().pages.map((page) => [
        page.id,
        page.iframeHtml ?? "",
      ]),
    );
    pendingPageHtmlBackupRef.current.clear();
    for (const pageId of pageIds) {
      pendingPageHtmlBackupRef.current.set(pageId, pagesById.get(pageId) ?? "");
    }
  }, []);

  const restorePageAfterFailedGeneration = useCallback(
    (pageId: string) => {
      const previousHtml = pendingPageHtmlBackupRef.current.get(pageId) ?? "";
      setPageHtml(
        pageId,
        previousHtml.trim().length > 0
          ? previousHtml
          : GENERATION_FAILURE_PREVIEW_HTML,
      );
    },
    [setPageHtml],
  );

  const markPagesAsLoading = useCallback(
    (pageIds: string[]) => {
      for (const pageId of pageIds) {
        setPageHtml(pageId, "");
      }
    },
    [setPageHtml],
  );

  const { messages, append, isLoading, stop } = useChat({
    api: `/api/wire/${wireId}`,
    body: { wireId },
    initialMessages,
    experimental_prepareRequestBody: ({
      messages: outgoingMessages,
      requestBody,
    }) => {
      const body = (requestBody ?? {}) as Record<string, unknown>;
      const preferredModel = isWireModelName(body.modelName)
        ? body.modelName
        : activeModelName;
      const selectedModel =
        enabledModelIds.find((modelId) => modelId === preferredModel) ??
        enabledModelIds[0] ??
        activeModelName;
      const variationCount =
        typeof body.variationCount === "number"
          ? body.variationCount
          : undefined;
      const isBatchRequest =
        typeof variationCount === "number" &&
        variationCount > 1 &&
        body.variationIndex === undefined;
      const storePages = useEditorStore.getState().pages;
      const targetPageId = isBatchRequest
        ? undefined
        : (pendingTargetPageIdRef.current ??
          selectedPageId ??
          storePages[0]?.id ??
          undefined);
      const targetPage = targetPageId
        ? storePages.find((page) => page.id === targetPageId)
        : undefined;
      const latestUserMessage = [...outgoingMessages]
        .reverse()
        .find(
          (message) =>
            message.role === "user" && typeof message.content === "string",
        );
      const promptText =
        (latestUserMessage?.content as string | undefined)?.trim() ??
        latestPromptRef.current;

      return {
        wireId,
        modelName: selectedModel,
        promptText,
        targetPageId,
        targetPageTitle: targetPage?.title,
        targetPageHtml: isBatchRequest
          ? undefined
          : (targetPage?.iframeHtml ?? ""),
        compactHistory: compactHistoryFromMessages(
          outgoingMessages as Message[],
        ),
        variationCount,
        variationIndex: body.variationIndex,
        variationThemeHint: body.variationThemeHint,
      };
    },
    onResponse: async (response) => {
      if (!response.ok) {
        const text = await response.text();
        const failureMessage =
          text?.trim() ||
          `Generation failed with ${pendingModelNameRef.current}. Try another model.`;
        pendingGenerationFailedRef.current = true;
        pendingGenerationErrorRef.current = failureMessage;
        rollbackPendingCreatedPages();
        reportError(failureMessage);
        stop();
        return;
      }
      setErrorMessage(null);
    },
    onError: (error) => {
      logger.error("wire_use_chat_stream_error", {
        modelName: pendingModelNameRef.current,
        error,
      });
      const failureMessage = normalizeGenerationErrorMessage({
        error,
        modelName: pendingModelNameRef.current,
      });
      pendingGenerationFailedRef.current = true;
      pendingGenerationErrorRef.current = failureMessage;
      rollbackPendingCreatedPages();
      reportError(failureMessage);
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
          const parsedBatch = parseBatchWireOutput(
            message.content,
            batchTargetPageIds.length,
          );
          const savePromises: Array<Promise<void>> = [];
          let successCount = 0;
          let failedCount = 0;
          let chartIconFailureCount = 0;

          for (let index = 0; index < batchTargetPageIds.length; index += 1) {
            const targetPageId = batchTargetPageIds[index];
            const htmlCandidate = parsedBatch.htmlByIndex[index] ?? "";
            if (!htmlCandidate.trim()) {
              failedCount += 1;
              if (
                pendingBatchCreatedPageIdsRef.current.includes(targetPageId)
              ) {
                deletePageLocal(targetPageId);
                savePromises.push(deletePageOnServer(targetPageId));
              } else {
                restorePageAfterFailedGeneration(targetPageId);
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
              if (
                pendingBatchCreatedPageIdsRef.current.includes(targetPageId)
              ) {
                deletePageLocal(targetPageId);
                savePromises.push(deletePageOnServer(targetPageId));
              } else {
                restorePageAfterFailedGeneration(targetPageId);
              }
              continue;
            }

            setPageHtml(targetPageId, normalized.html);
            savePromises.push(persistPageHtml(targetPageId, normalized.html));
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
              savePromises.push(
                persistPageHtml(batchTargetPageIds[0], fallbackNormalized.html),
              );
              successCount = 1;
            } else if (
              /<html[\s>]/i.test(fallbackNormalized.html) &&
              /<body[\s>]/i.test(fallbackNormalized.html)
            ) {
              setPageHtml(batchTargetPageIds[0], fallbackNormalized.html);
              savePromises.push(
                persistPageHtml(batchTargetPageIds[0], fallbackNormalized.html),
              );
              failedCount = Math.max(0, failedCount - 1);
              successCount = 1;
            }
          }

          if (savePromises.length > 0) {
            void Promise.all(savePromises).catch((error) => {
              logger.error("wire_batch_page_persist_failed", { error });
            });
          }

          if (successCount > 0) {
            setQualityNotice(null);
          }

          if (failedCount > 0) {
            if (chartIconFailureCount > 0) {
              reportError(
                `${failedCount} of ${batchTargetPageIds.length} variations failed. ${CHART_ICON_QUALITY_FAILURE_MESSAGE}`,
              );
              return;
            }
            reportError(
              `${failedCount} of ${batchTargetPageIds.length} variations failed. ${successCount} generated successfully.`,
            );
          } else {
            setErrorMessage(null);
          }
          return;
        }

        const targetPageId =
          pendingTargetPageIdRef.current ??
          useEditorStore.getState().pages[0]?.id;
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
          reportError(
            hasChartIconQualityViolation(initialQuality.violations)
              ? CHART_ICON_QUALITY_FAILURE_MESSAGE
              : "Generated output was not renderable. Try a more specific prompt.",
          );
          return;
        }

        setPageHtml(targetPageId, initialNormalized.html);
        void persistPageHtml(targetPageId, initialNormalized.html).catch(
          (error) => {
            logger.error("wire_page_persist_failed", {
              targetPageId,
              error,
            });
          },
        );
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

      if (enabledModelIds.length === 0) {
        reportError("No models are enabled. Enable at least one model in Profile.");
        return false;
      }

      const trimmedPrompt = promptText.trim();
      if (!trimmedPrompt) return false;

      const preferredModel = modelName ?? activeModelName;
      const selectedModel =
        enabledModelIds.find((id) => id === preferredModel) ?? enabledModelIds[0];

      pendingTargetPageIdRef.current = targetPageId;
      pendingCreatedPageIdRef.current = createdPageId ?? null;
      pendingBatchTargetPageIdsRef.current = null;
      pendingBatchCreatedPageIdsRef.current = [];
      pendingModelNameRef.current = selectedModel;
      pendingGenerationFailedRef.current = false;
      pendingGenerationErrorRef.current = null;
      hasShownErrorToastRef.current = false;
      latestPromptRef.current = trimmedPrompt;
      snapshotCurrentPageHtml([targetPageId]);
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
    [
      activeModelName,
      append,
      enabledModelIds,
      isLoading,
      reportError,
      rollbackPendingCreatedPages,
      snapshotCurrentPageHtml,
    ],
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
      if (enabledModelIds.length === 0) {
        reportError("No models are enabled. Enable at least one model in Profile.");
        return false;
      }
      const trimmedPrompt = promptText.trim();
      if (!trimmedPrompt || targetPageIds.length <= 1) return false;

      const selectedModel =
        enabledModelIds.find((id) => id === modelName) ?? enabledModelIds[0];

      pendingTargetPageIdRef.current = null;
      pendingCreatedPageIdRef.current = null;
      pendingBatchTargetPageIdsRef.current = targetPageIds;
      pendingBatchCreatedPageIdsRef.current = createdPageIds;
      pendingModelNameRef.current = selectedModel;
      pendingGenerationFailedRef.current = false;
      pendingGenerationErrorRef.current = null;
      hasShownErrorToastRef.current = false;
      latestPromptRef.current = trimmedPrompt;
      snapshotCurrentPageHtml(targetPageIds);
      setQualityNotice(null);
      setErrorMessage(null);
      markPagesAsLoading(targetPageIds);

      const body = {
        modelName: selectedModel,
        variationCount: targetPageIds.length,
        variationThemeHint: VARIATION_THEME_HINTS.slice(
          0,
          targetPageIds.length,
        ).join(" || "),
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
    [
      append,
      enabledModelIds,
      isLoading,
      markPagesAsLoading,
      reportError,
      rollbackPendingCreatedPages,
      snapshotCurrentPageHtml,
    ],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const targetPageId =
        selectedPageId ?? useEditorStore.getState().pages[0]?.id;
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

  const resizePromptTextarea = useCallback(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea) return;

    const computedStyles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyles.lineHeight) || 20;
    const minHeight = lineHeight * 3;
    const maxHeight = lineHeight * 9;

    textarea.style.height = "auto";
    const clampedHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight,
    );
    textarea.style.height = `${clampedHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

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
    resizePromptTextarea();
  }, [prompt, resizePromptTextarea]);

  useEffect(() => {
    let isCancelled = false;

    const loadAiSettings = async () => {
      try {
        const response = await fetch("/api/profile/ai-settings", {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!isCancelled) {
            setEnabledModelIds([...DEFAULT_ENABLED_WIRE_MODELS]);
          }
          return;
        }

        const payload = (await response.json()) as AiSettingsResponse;
        if (!isCancelled) {
          setEnabledModelIds(normalizeEnabledWireModels(payload.enabledModelIds));
        }
      } catch {
        if (!isCancelled) {
          setEnabledModelIds([...DEFAULT_ENABLED_WIRE_MODELS]);
        }
      }
    };

    void loadAiSettings();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (enabledModelIds.length === 0) return;
    if (!enabledModelIds.includes(activeModelName)) {
      setActiveModelName(enabledModelIds[0]);
    }
  }, [activeModelName, enabledModelIds]);

  useEffect(() => {
    if (autoRunRef.current) return;
    const autoRunTimerId = window.setTimeout(() => {
      if (autoRunRef.current) return;

      if (enabledModelIds.length === 0) {
        autoRunRef.current = true;
        reportError("No models are enabled. Enable at least one model in Profile.");
        return;
      }

      const storedModel = sessionStorage.getItem(`wireModel:${wireId}`);
      const resolvedModel =
        isWireModelName(storedModel) && enabledModelIds.includes(storedModel)
          ? storedModel
          : enabledModelIds.includes(activeModelName)
            ? activeModelName
            : enabledModelIds[0];
      if (
        isWireModelName(storedModel) &&
        enabledModelIds.includes(storedModel)
      ) {
        setActiveModelName(resolvedModel);
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
        try {
          let firstPageId = useEditorStore.getState().pages[0]?.id;
          let firstPageWasCreated = false;
          if (!firstPageId) {
            const createdFirstPage = await createPageOnServer("Page 1");
            createPageLocal(
              createdFirstPage.title,
              undefined,
              createdFirstPage.id,
            );
            firstPageId = createdFirstPage.id;
            firstPageWasCreated = true;
          }
          if (!firstPageId) return;

          const targets: Array<{ pageId: string; isCreated: boolean }> = [
            { pageId: firstPageId, isCreated: firstPageWasCreated },
          ];

          for (let index = 1; index < storedPageCount; index += 1) {
            const nextPageNumber = useEditorStore.getState().pages.length + 1;
            const createdPage = await createPageOnServer(
              `Page ${nextPageNumber}`,
            );
            createPageLocal(createdPage.title, undefined, createdPage.id);
            targets.push({ pageId: createdPage.id, isCreated: true });
          }

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

          await startBatchGeneration({
            promptText: storedPrompt,
            targetPageIds,
            createdPageIds,
            modelName: resolvedModel,
          });
        } catch {
          reportError(
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
    createPageLocal,
    createPageOnServer,
    enabledModelIds,
    markPagesAsLoading,
    startBatchGeneration,
    startGenerationForPage,
    reportError,
    wireId,
  ]);

  const containerClassName =
    variant === "panel"
      ? "h-full w-full p-4 flex flex-col gap-4 bg-transparent text-foreground"
      : "fixed right-5 top-5 bottom-5 w-80 p-4 flex flex-col gap-4 bg-transparent text-sidebar-foreground";

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
                : "bg-sidebar-accent text-sidebar-accent-foreground"
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
                : "bg-sidebar/60 text-sidebar-foreground"
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

  const enabledModelOptions = useMemo(
    () =>
      enabledModelIds
        .map((modelId) => WIRE_MODEL_OPTIONS.find((model) => model.id === modelId))
        .filter((model): model is (typeof WIRE_MODEL_OPTIONS)[number] => Boolean(model)),
    [enabledModelIds],
  );
  const noModelsEnabled = enabledModelIds.length === 0;
  const activeModelLabel =
    WIRE_MODEL_OPTIONS.find((model) => model.id === activeModelName)?.label ??
    activeModelName;
  const dropdownContentClassName =
    variant === "panel"
      ? "border-border bg-card text-foreground shadow-xl"
      : "border-border/70 bg-sidebar text-sidebar-foreground shadow-xl";
  const dropdownItemClassName =
    variant === "panel"
      ? undefined
      : "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

  return (
    <aside className={containerClassName}>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {renderedMessages}
        {errorMessage ? (
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-destructive/10 text-destructive"
                : "bg-sidebar/60 text-sidebar-foreground"
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
                : "bg-sidebar/60 text-sidebar-foreground"
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
                : "bg-sidebar/40 text-sidebar-foreground"
            }`}
          >
            Thinking...
          </div>
        ) : null}
        {noModelsEnabled ? (
          <div
            className={`max-w-[95%] rounded-xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "border border-destructive/30 bg-destructive/5 text-destructive"
                : "border border-border/60 bg-sidebar/60 text-sidebar-foreground"
            }`}
          >
            No models are enabled. Open{" "}
            <Link href="/profile" className="underline underline-offset-2">
              Profile
            </Link>{" "}
            to enable at least one model.
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0">
        <div
          className={`relative flex w-full flex-col overflow-hidden rounded-xl shadow-2xl transition-all ${
            variant === "panel"
              ? "border border-border bg-card"
              : "border border-border/60 bg-sidebar/80"
          }`}
        >
          <textarea
            ref={promptTextareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onInput={resizePromptTextarea}
            placeholder="Ask a follow-up..."
            rows={3}
            className={`mx-2 mt-2 w-[calc(100%-1rem)] resize-none rounded-md border px-3 pb-2 pt-3 text-sm leading-5 focus:outline-none focus-visible:outline-none focus:ring-0 ${
              variant === "panel"
                ? "border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/60"
                : "border-border/60 bg-sidebar/40 text-sidebar-foreground placeholder:text-sidebar-foreground/60"
            }`}
          />
          <div
            className={`flex items-center justify-between gap-2 px-2 pb-2 pt-1 ${
              variant === "panel" ? "border-t border-border/60" : "border-t border-border/60"
            }`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`flex h-8 items-center gap-1 rounded-md px-2 text-xs ${
                      variant === "panel"
                        ? "text-muted-foreground hover:bg-accent"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
                    }`}
                    disabled={noModelsEnabled}
                  >
                    <GeminiIcon className="h-3 w-3 text-primary" />
                    {activeModelLabel}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className={dropdownContentClassName}>
                  {enabledModelOptions.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onClick={() => setActiveModelName(model.id)}
                      className={dropdownItemClassName}
                    >
                      <GeminiIcon className="mr-2 size-4 text-primary" />
                      {model.label}
                    </DropdownMenuItem>
                  ))}
                  {enabledModelOptions.length === 0 ? (
                    <DropdownMenuItem disabled className={dropdownItemClassName}>
                      No models enabled
                    </DropdownMenuItem>
                  ) : null}
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
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <span className="truncate">Edit: {selectedPageTitle}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className={dropdownContentClassName}>
                  {pages.map((page) => (
                    <DropdownMenuItem
                      key={page.id}
                      onClick={() => setSelectedPageId(page.id)}
                      className={dropdownItemClassName}
                    >
                      {page.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !prompt.trim() || !selectedPageId || noModelsEnabled}
              size="icon"
              className={`h-8 w-8 shrink-0 ${
                variant === "panel"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-20"
                  : "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 disabled:opacity-20"
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
