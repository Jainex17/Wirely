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
import { Check, ChevronDown, Loader2, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/store/useEditorStore";
import {
  normalizeGeneratedHtml,
  parseBatchWireOutput,
  parseWireOutput,
  summarizeAssistantDetails,
} from "@/lib/wireOutput";
import { evaluateWireHtmlQuality } from "@/lib/wireQuality";
import { selectWireStylePreset } from "@/lib/wirePrompt";
import {
  DEFAULT_ENABLED_WIRE_MODELS,
  DEFAULT_WIRE_MODEL,
  WIRE_MODEL_OPTIONS,
  getWireModelProvider,
  isWireModelName,
  normalizeEnabledWireModels,
  type WireModelName,
} from "@/lib/wireModels";
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";
import GeminiIcon from "@/components/icons/GeminiIcon";
import {
  ALL_PAGES_PROMPT_TARGET_ID,
  isAllPagesPromptTarget,
  isNewPagePromptTarget,
  NEW_PAGE_PROMPT_TARGET_ID,
  resolvePromptTargetPageId,
  resolvePromptTargetPageTitle,
} from "@/lib/wirePromptTarget";
import {
  getWireConversationModelUsage,
  type WireConversationModelUsage,
} from "@/lib/wireConversationModels";
import { isWireProgressEvent } from "@/lib/wireProgressEvents";
import { useWireProgress } from "@/hooks/useWireProgress";
import { resolveDeviceIntent } from "@/lib/wireFallbackPlan";
import type { PageDeviceType } from "@/lib/types";
import type {
  WireProgressPageStatus,
  WireProgressStage,
} from "@/lib/wireProgressEvents";

interface WirePromptSidebarProps {
  wireId: string;
  variant?: "floating" | "panel";
  initialModelName?: WireModelName;
  initialMessages?: Array<
    Message &
      WireConversationModelUsage & {
        planningSummary?: string | null;
      }
  >;
  selectedPageId: string | null;
  onSelectedPageIdChange: (pageId: string | null) => void;
  focusRequestKey?: number;
}

interface AiSettingsResponse {
  enabledModelIds: WireModelName[];
}

interface CompactHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface SidebarMessage extends Message, WireConversationModelUsage {
  planningSummary?: string | null;
}

type RequestedGenerationMode =
  | "single_page"
  | "concept_variants"
  | "information_architecture";

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

const parseStoredGenerationMode = (
  raw: string | null,
): RequestedGenerationMode | null => {
  if (
    raw === "single_page" ||
    raw === "concept_variants" ||
    raw === "information_architecture"
  ) {
    return raw;
  }
  return null;
};

const CHART_ICON_QUALITY_FAILURE_MESSAGE =
  "Generated dashboard output is missing real charts or SVG icons, or still contains chart placeholders. Regenerate with stricter chart output.";

const MODEL_PROVIDER_LABEL = {
  google: "Google",
  openrouter: "OpenRouter",
  zai: "Z.ai",
} as const;

const STAGE_LABELS: Record<WireProgressStage, string> = {
  processing: "Processing your request…",
  thinking: "Thinking about your request…",
  planning: "Planning the design…",
  generating: "Generating screens…",
  finalizing: "Finalizing…",
};

const PAGE_STATUS_LABELS: Record<WireProgressPageStatus, string> = {
  queued: "Queued",
  generating: "Writing…",
  repairing: "Repairing…",
  completed: "Done",
  failed: "Failed",
};

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
  const provider = getWireModelProvider(modelName);
  const providerName =
    provider === "openrouter"
      ? "OpenRouter"
      : provider === "google"
        ? "Google"
        : provider === "zai"
          ? "Z.ai"
        : "Provider";
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim();

  if (!message) return fallback;
  if (/aborted|cancelled|network|fetch failed|stream closed/i.test(message)) {
    return "Generation stream closed early. Retry, or switch to another model.";
  }
  if (/quota|rate limit|resource exhausted|429|too many requests/i.test(message)) {
    return "Model quota/rate limit reached. Retry later or switch to another model.";
  }
  if (/deadline|timeout|max duration/i.test(message)) {
    return "Generation timed out on the server. Retry with a shorter prompt or switch models.";
  }
  if (/api key|permission|unauthorized|403|401/i.test(message)) {
    return `${providerName} API key is invalid or missing required access for this model.`;
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
    return summarizeAssistantDetails({
      content: `DETAILS:\n${parsedBatch.details}`,
    });
  }
  return summarizeAssistantDetails({ content });
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

    if (message.role === "assistant") {
      const details = getAssistantDetails(message.content);
      // Skip assistant messages without meaningful details (in-flight or
      // failed runs) so empty history entries don't reach the model.
      if (!details) continue;
      compact.push({ role: message.role, content: details });
      continue;
    }
    const content = message.content.trim();
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
  selectedPageId,
  onSelectedPageIdChange,
  focusRequestKey = 0,
}: WirePromptSidebarProps) {
  const [prompt, setPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);
  const [activeModelName, setActiveModelName] =
    useState<WireModelName>(initialModelName);
  const [enabledModelIds, setEnabledModelIds] = useState<WireModelName[]>([
    ...DEFAULT_ENABLED_WIRE_MODELS,
  ]);
  const [isAiSettingsLoaded, setIsAiSettingsLoaded] = useState(false);
  const [messageModelUsageById, setMessageModelUsageById] = useState<
    Record<string, WireConversationModelUsage>
  >(() =>
    Object.fromEntries(
      initialMessages
        .filter((message) => typeof message.id === "string")
        .map((message) => [
          message.id as string,
          {
            selectedModelName: message.selectedModelName,
            plannerModelName: message.plannerModelName,
            criticModelName: message.criticModelName,
          },
        ]),
    ),
  );
  const [messagePlanningById, setMessagePlanningById] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      initialMessages
        .filter(
          (message) =>
            typeof message.id === "string" &&
            typeof message.planningSummary === "string" &&
            message.planningSummary.trim().length > 0,
        )
        .map((message) => [message.id as string, message.planningSummary as string]),
    ),
  );

  const autoRunRef = useRef(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const latestPromptRef = useRef("");
  const pendingTargetPageIdRef = useRef<string | null>(null);
  const pendingCreatedPageIdRef = useRef<string | null>(null);
  const pendingBatchTargetPageIdsRef = useRef<string[] | null>(null);
  const pendingBatchCreatedPageIdsRef = useRef<string[]>([]);
  const pendingPageHtmlBackupRef = useRef<Map<string, string>>(new Map());
  const pendingModelNameRef = useRef<WireModelName>(initialModelName);
  const pendingUserMessageIdRef = useRef<string | null>(null);
  const pendingGenerationFailedRef = useRef(false);
  const pendingGenerationErrorRef = useRef<string | null>(null);
  const hasShownErrorToastRef = useRef(false);

  const pages = useEditorStore((state) => state.pages);
  const setPageHtml = useEditorStore((state) => state.setPageHtml);
  const createPageLocal = useEditorStore((state) => state.createPage);
  const deletePageLocal = useEditorStore((state) => state.deletePage);
  const renamePageLocal = useEditorStore((state) => state.renamePage);
  const setPageDeviceType = useEditorStore((state) => state.setPageDeviceType);
  const setPageStatus = useEditorStore((state) => state.setPageStatus);
  const clearPageStatuses = useEditorStore((state) => state.clearPageStatuses);
  const beginSaving = useEditorStore((state) => state.beginSaving);
  const endSaving = useEditorStore((state) => state.endSaving);
  const requestGeneratedPageFocusCheck = useEditorStore(
    (state) => state.requestGeneratedPageFocusCheck,
  );

  const clearPendingGeneration = useCallback(() => {
    pendingTargetPageIdRef.current = null;
    pendingCreatedPageIdRef.current = null;
    pendingBatchTargetPageIdsRef.current = null;
    pendingBatchCreatedPageIdsRef.current = [];
    pendingPageHtmlBackupRef.current.clear();
    pendingUserMessageIdRef.current = null;
    clearPageStatuses();
  }, [clearPageStatuses]);

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
      beginSaving();
      try {
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
      } finally {
        endSaving();
      }
    },
    [beginSaving, endSaving, wireId],
  );

  const persistPageHtml = useCallback(
    async (pageId: string, htmlContent: string) => {
      await persistPageUpdate(pageId, { htmlContent });
    },
    [persistPageUpdate],
  );

  const createPageOnServer = useCallback(
    async (title: string, deviceType?: PageDeviceType) => {
      beginSaving();
      try {
        const response = await fetch(`/api/projects/${wireId}/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, ...(deviceType ? { deviceType } : {}) }),
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
      } finally {
        endSaving();
      }
    },
    [beginSaving, endSaving, wireId],
  );

  const deletePageOnServer = useCallback(
    async (pageId: string) => {
      beginSaving();
      try {
        const response = await fetch(`/api/projects/${wireId}/pages/${pageId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(`Page deletion failed with status ${response.status}`);
        }
      } finally {
        endSaving();
      }
    },
    [beginSaving, endSaving, wireId],
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

  const {
    messages,
    append,
    isLoading,
    stop,
    data,
    setData,
  } = useChat({
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
      const targetPageIds = Array.isArray(body.targetPageIds)
        ? body.targetPageIds.filter((value): value is string => typeof value === "string")
        : undefined;
      const isBatchRequest =
        typeof variationCount === "number" &&
        variationCount > 1 &&
        body.variationIndex === undefined;
      const storePages = useEditorStore.getState().pages;
      const effectiveTargetPageId = resolvePromptTargetPageId(
        storePages,
        selectedPageId,
      );
      const targetPageId = isBatchRequest
        ? undefined
        : (pendingTargetPageIdRef.current ??
          effectiveTargetPageId ??
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
        targetPageIds,
        variationIndex: body.variationIndex,
        variationThemeHint: body.variationThemeHint,
      };
    },
    onResponse: async (response) => {
      if (!response.ok) {
        const pendingUserMessageId = pendingUserMessageIdRef.current;
        if (pendingUserMessageId) {
          setMessagePlanningById((current) => {
            const next = { ...current };
            delete next[pendingUserMessageId];
            return next;
          });
        }
        const text = await response.clone().text();
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
      const pendingUserMessageId = pendingUserMessageIdRef.current;
      if (pendingUserMessageId) {
        setMessagePlanningById((current) => {
          const next = { ...current };
          delete next[pendingUserMessageId];
          return next;
        });
      }
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
        setMessageModelUsageById((current) => ({
          ...current,
          ...(message.id
            ? {
                [message.id]: {
                  selectedModelName: pendingModelNameRef.current,
                  plannerModelName: pendingModelNameRef.current,
                  criticModelName: pendingModelNameRef.current,
                },
              }
            : {}),
        }));
        const activePrompt = latestPromptRef.current;
        const allowImages = true;
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
          const successfulPageIds: string[] = [];

          for (let index = 0; index < batchTargetPageIds.length; index += 1) {
            const targetPageId = batchTargetPageIds[index];
            const htmlCandidate = parsedBatch.htmlByIndex[index] ?? "";
            const nextTitle = parsedBatch.titleByIndex[index]?.trim() ?? "";
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

            setPageHtml(targetPageId, normalized.html, nextTitle || undefined);
            savePromises.push(
              persistPageUpdate(targetPageId, {
                ...(nextTitle ? { title: nextTitle } : {}),
                htmlContent: normalized.html,
              }),
            );
            successCount += 1;
            successfulPageIds.push(targetPageId);
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
              successfulPageIds.push(batchTargetPageIds[0]);
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
              successfulPageIds.push(batchTargetPageIds[0]);
            }
          }

          if (savePromises.length > 0) {
            void Promise.all(savePromises).catch((error) => {
              logger.error("wire_batch_page_persist_failed", { error });
            });
          }

          if (successCount > 0) {
            requestGeneratedPageFocusCheck(
              successfulPageIds.length > 0
                ? successfulPageIds
                : [batchTargetPageIds[0]],
            );
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
        const parsedSingle = parseWireOutput(message.content);
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

        setPageHtml(
          targetPageId,
          initialNormalized.html,
          parsedSingle.title.trim() || undefined,
        );
        requestGeneratedPageFocusCheck([targetPageId]);
        void persistPageUpdate(targetPageId, {
          ...(parsedSingle.title.trim()
            ? { title: parsedSingle.title.trim() }
            : {}),
          htmlContent: initialNormalized.html,
        }).catch(
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

  const progress = useWireProgress(data as unknown[] | undefined);

  useEffect(() => {
    if (!data || data.length === 0) return;
    for (const entry of data as unknown[]) {
      if (!isWireProgressEvent(entry)) continue;
      if (entry.type === "page") {
        setPageDeviceType(entry.pageId, entry.deviceType);
        renamePageLocal(entry.pageId, entry.title);
      } else if (entry.type === "page-status") {
        setPageStatus(entry.pageId, entry.status, entry.detail);
      }
    }
  }, [data, renamePageLocal, setPageDeviceType, setPageStatus]);

  useEffect(() => {
    const pendingUserMessageId = pendingUserMessageIdRef.current;
    const summary = progress.planningSummary;
    if (!summary || !pendingUserMessageId) return;
    setMessagePlanningById((current) => {
      if (current[pendingUserMessageId] === summary) {
        return current;
      }
      return {
        ...current,
        [pendingUserMessageId]: summary,
      };
    });
  }, [progress.planningSummary]);

  const handleStopGeneration = useCallback(() => {
    stop();
    rollbackPendingCreatedPages();
  }, [rollbackPendingCreatedPages, stop]);

  const handleSuggestionClick = useCallback(
    (chip: string) => {
      setPrompt(chip);
      window.requestAnimationFrame(() => {
        const textarea = promptTextareaRef.current;
        if (!textarea) return;
        textarea.focus();
        const cursorPosition = textarea.value.length;
        textarea.setSelectionRange(cursorPosition, cursorPosition);
      });
    },
    [],
  );

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
        reportError("No models are enabled. Enable at least one model in Models.");
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
      setData([]);

      const body: Record<string, unknown> = {
        modelName: selectedModel,
      };
      const userMessageId = crypto.randomUUID();
      const modelUsage = {
        selectedModelName: selectedModel,
        plannerModelName: selectedModel,
        criticModelName: selectedModel,
      } satisfies WireConversationModelUsage;
      setMessageModelUsageById((current) => ({
        ...current,
        [userMessageId]: modelUsage,
      }));
      setMessagePlanningById((current) => ({
        ...current,
        [userMessageId]: "Generating plan...",
      }));
      pendingUserMessageIdRef.current = userMessageId;

      try {
        await append(
          {
            id: userMessageId,
            role: "user",
            content: trimmedPrompt,
            ...modelUsage,
          } as SidebarMessage,
          { body },
        );

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
      setData,
    ],
  );

  const startBatchGeneration = useCallback(
    async ({
      promptText,
      targetPageIds,
      createdPageIds,
      modelName,
      generationMode,
    }: {
      promptText: string;
      targetPageIds: string[];
      createdPageIds: string[];
      modelName: WireModelName;
      generationMode?: RequestedGenerationMode;
    }) => {
      if (isLoading) return false;
      if (enabledModelIds.length === 0) {
        reportError("No models are enabled. Enable at least one model in Models.");
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
      setData([]);

      const body = {
        modelName: selectedModel,
        variationCount: targetPageIds.length,
        targetPageIds,
        ...(generationMode ? { generationMode } : {}),
      };
      const userMessageId = crypto.randomUUID();
      const modelUsage = {
        selectedModelName: selectedModel,
        plannerModelName: selectedModel,
        criticModelName: selectedModel,
      } satisfies WireConversationModelUsage;
      setMessageModelUsageById((current) => ({
        ...current,
        [userMessageId]: modelUsage,
      }));
      setMessagePlanningById((current) => ({
        ...current,
        [userMessageId]: "Generating plan...",
      }));
      pendingUserMessageIdRef.current = userMessageId;

      try {
        await append(
          {
            id: userMessageId,
            role: "user",
            content: trimmedPrompt,
            ...modelUsage,
          } as SidebarMessage,
          { body },
        );

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
      setData,
    ],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (isAllPagesPromptTarget(selectedPageId)) {
        const targetPageIds = useEditorStore.getState().pages.map((page) => page.id);
        if (targetPageIds.length === 0) return;

        if (targetPageIds.length === 1) {
          const generated = await startGenerationForPage({
            promptText: prompt,
            targetPageId: targetPageIds[0],
          });

          if (generated) {
            setPrompt("");
          }
          return;
        }

        const generated = await startBatchGeneration({
          promptText: prompt,
          targetPageIds,
          createdPageIds: [],
          modelName: activeModelName,
          generationMode: "information_architecture",
        });

        if (generated) {
          setPrompt("");
        }
        return;
      }

      if (isNewPagePromptTarget(selectedPageId)) {
        try {
          const nextPageNumber = useEditorStore.getState().pages.length + 1;
          const createdPage = await createPageOnServer(`Page ${nextPageNumber}`);
          createPageLocal(
            createdPage.title,
            undefined,
            createdPage.id,
            resolveDeviceIntent(prompt),
          );
          onSelectedPageIdChange(createdPage.id);

          const generated = await startGenerationForPage({
            promptText: prompt,
            targetPageId: createdPage.id,
            createdPageId: createdPage.id,
          });

          if (generated) {
            setPrompt("");
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Could not create a new page. Please try again.";
          reportError(message);
        }
        return;
      }

      const targetPageId = resolvePromptTargetPageId(
        useEditorStore.getState().pages,
        selectedPageId,
      );
      if (!targetPageId) return;

      const generated = await startGenerationForPage({
        promptText: prompt,
        targetPageId,
      });

      if (generated) {
        setPrompt("");
      }
    },
    [
      createPageLocal,
      createPageOnServer,
      activeModelName,
      onSelectedPageIdChange,
      prompt,
      reportError,
      selectedPageId,
      startBatchGeneration,
      startGenerationForPage,
    ],
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
    resizePromptTextarea();
  }, [prompt, resizePromptTextarea]);

  useEffect(() => {
    const effectiveSelectedPageId = resolvePromptTargetPageId(
      pages,
      selectedPageId,
    );
    if (!focusRequestKey || (!effectiveSelectedPageId && !isAllPagesPromptTarget(selectedPageId))) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const textarea = promptTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const cursorPosition = textarea.value.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [focusRequestKey, pages, selectedPageId]);

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
            setIsAiSettingsLoaded(true);
          }
          return;
        }

        const payload = (await response.json()) as AiSettingsResponse;
        if (!isCancelled) {
          setEnabledModelIds(normalizeEnabledWireModels(payload.enabledModelIds));
          setIsAiSettingsLoaded(true);
        }
      } catch {
        if (!isCancelled) {
          setEnabledModelIds([...DEFAULT_ENABLED_WIRE_MODELS]);
          setIsAiSettingsLoaded(true);
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
    if (!isAiSettingsLoaded) return;
    if (autoRunRef.current) return;
    const autoRunTimerId = window.setTimeout(() => {
      if (!isAiSettingsLoaded) return;
      if (autoRunRef.current) return;

      if (enabledModelIds.length === 0) {
        autoRunRef.current = true;
        reportError("No models are enabled. Enable at least one model in Models.");
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
      const storedGenerationMode = parseStoredGenerationMode(
        sessionStorage.getItem(`wireGenerationMode:${wireId}`),
      );

      autoRunRef.current = true;
      sessionStorage.removeItem(`wireModel:${wireId}`);
      sessionStorage.removeItem(`wirePrompt:${wireId}`);
      sessionStorage.removeItem(`wirePageCount:${wireId}`);
      sessionStorage.removeItem(`wireGenerationMode:${wireId}`);

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
            createPageLocal(
              createdPage.title,
              undefined,
              createdPage.id,
              resolveDeviceIntent(storedPrompt),
            );
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
            generationMode: storedGenerationMode ?? undefined,
          });
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : `Could not generate ${storedPageCount} pages in one request. Please try again.`;
          reportError(message);
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
    isAiSettingsLoaded,
    markPagesAsLoading,
    startBatchGeneration,
    startGenerationForPage,
    reportError,
    wireId,
  ]);

  const handleModelSelection = useCallback((modelId: WireModelName) => {
    setActiveModelName(modelId);
  }, []);

  const containerClassName =
    variant === "panel"
      ? "h-full w-full p-4 flex flex-col gap-4 bg-transparent text-foreground"
      : "fixed right-5 top-5 bottom-5 w-80 p-4 flex flex-col gap-4 bg-transparent text-sidebar-foreground";

  const renderedMessages = useMemo(() => {
    const lastUserMessageIndex = [...messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === "user")?.index;

    const items = messages.flatMap((message, index) => {
      const key = message.id ?? `${message.role}-${index}`;
      const modelUsage = getWireConversationModelUsage({
        selectedModelName:
          messageModelUsageById[key]?.selectedModelName ??
          (message as SidebarMessage).selectedModelName,
        plannerModelName:
          messageModelUsageById[key]?.plannerModelName ??
          (message as SidebarMessage).plannerModelName,
        criticModelName:
          messageModelUsageById[key]?.criticModelName ??
          (message as SidebarMessage).criticModelName,
      });
      const modelUsageUi = modelUsage ? (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-4 opacity-70">
          {modelUsage.selectedModelName ? (
            <span>
              {modelUsage.selectedModelName}
            </span>
          ) : null}
          {modelUsage.hasSpecializedStages && modelUsage.plannerModelName ? (
            <span>
              Plan: {modelUsage.plannerModelName}
            </span>
          ) : null}
          {modelUsage.hasSpecializedStages && modelUsage.criticModelName ? (
            <span>
              Critic: {modelUsage.criticModelName}
            </span>
          ) : null}
        </div>
      ) : null;
      if (message.role === "user") {
        const planningSummary =
          messagePlanningById[key] ??
          ((message as SidebarMessage).planningSummary?.trim() || "");
        const userBubble = (
          <div
            key={key}
            className={`ml-auto max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-primary text-primary-foreground"
                : "bg-sidebar-accent text-sidebar-accent-foreground"
            }`}
          >
            <div>{message.content}</div>
          </div>
        );

        const isPendingLastUser = isLoading && index === lastUserMessageIndex;

        const progressPanel = isPendingLastUser ? (
          <div
            key={`${key}-progress`}
            className={`mx-auto w-full max-w-[92%] rounded-xl border px-3 py-2.5 ${
              variant === "panel"
                ? "border-border bg-muted/30"
                : "border-border/60 bg-sidebar/50"
            }`}
          >
            <div
              className={`flex items-center gap-2 text-[11px] font-medium ${
                variant === "panel"
                  ? "text-muted-foreground"
                  : "text-sidebar-foreground/70"
              }`}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress.stage ? STAGE_LABELS[progress.stage] : "Processing your request…"}
            </div>
            {progress.planItems.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {progress.planItems.map((item) => {
                  const pageStatus = item.pageId
                    ? progress.pageStatusById[item.pageId]
                    : undefined;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      {pageStatus === "completed" ? (
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      ) : pageStatus === "failed" ? (
                        <X className="h-3 w-3 shrink-0 text-destructive" />
                      ) : (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/70" />
                      )}
                      <span
                        className={
                          variant === "panel"
                            ? "truncate text-foreground/85"
                            : "truncate text-sidebar-foreground/85"
                        }
                      >
                        {item.label}
                      </span>
                      {pageStatus ? (
                        <span
                          className={`ml-auto shrink-0 text-[10px] uppercase tracking-wide ${
                            variant === "panel"
                              ? "text-muted-foreground/70"
                              : "text-sidebar-foreground/60"
                          }`}
                        >
                          {PAGE_STATUS_LABELS[pageStatus]}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null;

        const planningBubble =
          !isPendingLastUser && planningSummary ? (
            <details
              key={`${key}-planning`}
              className="group mx-auto w-full max-w-[92%] py-1 text-center"
            >
              <summary
                className={`flex cursor-pointer list-none items-center gap-4 text-[11px] font-medium transition-opacity hover:opacity-100 select-none marker:hidden ${
                  variant === "panel"
                    ? "text-muted-foreground opacity-80"
                    : "text-sidebar-foreground/70 opacity-80"
                }`}
              >
                <span
                  className={`h-px flex-1 ${
                    variant === "panel" ? "bg-border" : "bg-border/60"
                  }`}
                />
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  Worked plan
                  <span
                    aria-hidden="true"
                    className="text-sm leading-none transition-transform duration-300 ease-out group-open:rotate-90"
                  >
                    ›
                  </span>
                </span>
                <span
                  className={`h-px flex-1 ${
                    variant === "panel" ? "bg-border" : "bg-border/60"
                  }`}
                />
              </summary>
              <div className="grid grid-rows-[0fr] transition-[grid-template-rows,opacity,margin] duration-300 ease-out group-open:mt-2 group-open:grid-rows-[1fr]">
                <div className="overflow-hidden">
                  <div
                    className={`whitespace-pre-wrap text-left text-[11px] leading-4 transition-transform duration-300 ease-out group-open:translate-y-0 translate-y-1 ${
                      variant === "panel"
                        ? "text-muted-foreground"
                        : "text-sidebar-foreground/80"
                    }`}
                  >
                    {planningSummary}
                  </div>
                </div>
              </div>
            </details>
          ) : null;

        const followUp = progressPanel ?? planningBubble;
        return followUp ? [userBubble, followUp] : [userBubble];
      }

      if (message.role === "assistant") {
        const details = getAssistantDetails(message.content);
        if (!details) {
          return [];
        }
        return [
          <div
            key={key}
            className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              variant === "panel"
                ? "bg-muted text-foreground"
                : "bg-sidebar/60 text-sidebar-foreground"
            }`}
          >
            <div>{details}</div>
            {modelUsageUi}
          </div>,
        ];
      }

      return [];
    });

    return items;
  }, [isLoading, messageModelUsageById, messagePlanningById, messages, progress, variant]);

  const effectiveSelectedPageId = resolvePromptTargetPageId(pages, selectedPageId);
  const selectedPageTitle = resolvePromptTargetPageTitle(
    pages,
    effectiveSelectedPageId,
  );

  const noModelsEnabled = enabledModelIds.length === 0;
  const groupedEnabledModels = useMemo(() => {
    const grouped = {
      google: [] as typeof WIRE_MODEL_OPTIONS,
      openrouter: [] as typeof WIRE_MODEL_OPTIONS,
      zai: [] as typeof WIRE_MODEL_OPTIONS,
    };

    enabledModelIds.forEach((modelId) => {
      const model = WIRE_MODEL_OPTIONS.find((option) => option.id === modelId);
      if (model) {
        grouped[model.provider].push(model);
      }
    });

    return grouped;
  }, [enabledModelIds]);
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
        {noModelsEnabled ? (
          <div
            className={`max-w-[95%] rounded-xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "border border-destructive/30 bg-destructive/5 text-destructive"
                : "border border-border/60 bg-sidebar/60 text-sidebar-foreground"
            }`}
          >
            No models are enabled. Open{" "}
            <Link href="/setting?tab=models" className="underline underline-offset-2">
              Models
            </Link>{" "}
            to enable at least one model.
          </div>
        ) : null}
        {!isLoading && !noModelsEnabled && progress.suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pr-1">
            {progress.suggestions.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSuggestionClick(chip)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  variant === "panel"
                    ? "border-border bg-muted/40 text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                    : "border-border/60 bg-sidebar/50 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                {chip}
              </button>
            ))}
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
          {effectiveSelectedPageId ? (
            <div className="px-2 pt-2">
              <div
                className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${
                  variant === "panel"
                    ? "border-border bg-muted/50 text-muted-foreground"
                    : "border-border/60 bg-sidebar/50 text-sidebar-foreground/75"
                }`}
              >
                <span className="max-w-[180px] truncate normal-case tracking-normal text-foreground">
                  {selectedPageTitle}
                </span>
              </div>
            </div>
          ) : null}
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
                  {(["google", "openrouter", "zai"] as const).map((provider, index) => {
                    const providerModels = groupedEnabledModels[provider];
                    if (providerModels.length === 0) return null;

                    return (
                      <DropdownMenuGroup key={provider}>
                        {index > 0 ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuLabel className="px-2 py-1.5 text-xs">
                          {MODEL_PROVIDER_LABEL[provider]}
                        </DropdownMenuLabel>
                        {providerModels.map((model) => (
                          <DropdownMenuItem
                            key={model.id}
                            onClick={() => handleModelSelection(model.id)}
                            className={dropdownItemClassName}
                          >
                            <div className="flex w-full items-start gap-2">
                              <GeminiIcon className="mr-1 mt-0.5 size-4 text-primary" />
                              <span>{model.label}</span>
                              <span
                                className={`ml-auto mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                                  model.tier === "paid"
                                    ? "bg-secondary text-secondary-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {model.tier}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    );
                  })}
                  {enabledModelIds.length === 0 ? (
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
                  <DropdownMenuItem
                    onClick={() => onSelectedPageIdChange(ALL_PAGES_PROMPT_TARGET_ID)}
                    className={dropdownItemClassName}
                  >
                    All pages
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onSelectedPageIdChange(NEW_PAGE_PROMPT_TARGET_ID)}
                    className={dropdownItemClassName}
                  >
                    New page
                  </DropdownMenuItem>
                  {pages.map((page) => (
                    <DropdownMenuItem
                      key={page.id}
                      onClick={() => onSelectedPageIdChange(page.id)}
                      className={dropdownItemClassName}
                    >
                      {page.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-1">
              {isLoading ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 shrink-0 ${
                    variant === "panel"
                      ? "text-muted-foreground hover:bg-accent"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
                  }`}
                  onClick={handleStopGeneration}
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={
                  isLoading ||
                  !prompt.trim() ||
                  !effectiveSelectedPageId ||
                  noModelsEnabled
                }
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
        </div>
      </form>
    </aside>
  );
}
