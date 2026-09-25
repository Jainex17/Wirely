"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
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
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";
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
  WIRE_MODEL_PROVIDER_LABEL,
  type WireModelOption,
  type WireModelProvider,
  isWireModelName,
  normalizeEnabledWireModels,
  type WireModelName,
} from "@/lib/wireModels";
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";
import GeminiIcon from "@/components/icons/GeminiIcon";
import {
  filterMentionPages,
  findMentionQuery,
  inferPromptTarget,
  MAX_PROMPT_TARGET_PAGES,
  mentionLabel,
  pruneMentions,
  type PromptMention,
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
  initialModelName?: WireModelName;
  initialMessages?: Array<
    Message &
      WireConversationModelUsage & {
        planningSummary?: string | null;
      }
  >;
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

const CHART_ICON_QUALITY_FAILURE_MESSAGE =
  "Generated dashboard output is missing real charts or SVG icons, or still contains chart placeholders. Regenerate with stricter chart output.";

const STAGE_LABELS: Record<WireProgressStage, string> = {
  processing: "Processing your request…",
  researching: "Reading the site you linked…",
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

const getModelLabel = (modelName: string) =>
  WIRE_MODEL_OPTIONS.find((option) => option.id === modelName)?.label ??
  modelName;

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
  initialModelName = DEFAULT_WIRE_MODEL,
  initialMessages = [],
  focusRequestKey = 0,
}: WirePromptSidebarProps) {
  const [prompt, setPromptText] = useState("");
  const [mentions, setMentions] = useState<PromptMention[]>([]);
  // Every prompt write goes through here so a mention whose text is gone,
  // including after a send clears the box, never targets a page.
  const setPrompt = useCallback((nextPrompt: string) => {
    setPromptText(nextPrompt);
    setMentions((current) => pruneMentions(nextPrompt, current));
  }, []);
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
  const { ref: promptTextareaRef, resize: resizePromptTextarea } =
    useAutoGrowTextarea({ value: prompt, minRows: 4 });
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
      const { pages: storePages, focusedPageId } = useEditorStore.getState();
      const fallbackTarget = inferPromptTarget({
        prompt: "",
        mentionedPageIds: [],
        pages: storePages,
        focusedPageId,
      });
      const targetPageId = isBatchRequest
        ? undefined
        : (pendingTargetPageIdRef.current ??
          (fallbackTarget.kind === "page" ? fallbackTarget.pageId : undefined));
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
        // The planner can ask the server for more pages than the client created,
        // so a page id here may be one this canvas has never seen.
        const isKnownPage = useEditorStore
          .getState()
          .pages.some((page) => page.id === entry.pageId);
        if (isKnownPage) {
          setPageDeviceType(entry.pageId, entry.deviceType);
          renamePageLocal(entry.pageId, entry.title);
        } else {
          createPageLocal(entry.title, undefined, entry.pageId, entry.deviceType);
        }
      } else if (entry.type === "page-status") {
        setPageStatus(entry.pageId, entry.status, entry.detail);
      }
    }
  }, [createPageLocal, data, renamePageLocal, setPageDeviceType, setPageStatus]);

  // Streamed partial HTML goes into the page itself, so the existing sandboxed
  // preview renders it. Once a page completes it keeps its last draft until the
  // run's accepted HTML replaces it; a page that fails drops the draft for the
  // HTML it had before the run.
  useEffect(() => {
    const pagesById = new Map(
      useEditorStore.getState().pages.map((page) => [page.id, page.iframeHtml ?? ""]),
    );
    for (const [pageId, html] of Object.entries(progress.previewHtmlById)) {
      const status = progress.pageStatusById[pageId];
      const currentHtml = pagesById.get(pageId);
      if (status === "generating" || status === "repairing") {
        if (currentHtml !== html) {
          setPageHtml(pageId, html, undefined, getModelLabel(pendingModelNameRef.current));
        }
      } else if (status === "failed" && currentHtml === html) {
        restorePageAfterFailedGeneration(pageId);
      }
    }
  }, [
    progress.pageStatusById,
    progress.previewHtmlById,
    restorePageAfterFailedGeneration,
    setPageHtml,
  ]);

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
    [promptTextareaRef, setPrompt],
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
      // Marked before the server's own queued event so the live page sync
      // leaves this page alone while the run plans.
      setPageStatus(targetPageId, "queued");
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
      setPageStatus,
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
      for (const pageId of targetPageIds) setPageStatus(pageId, "queued");
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
      setPageStatus,
      snapshotCurrentPageHtml,
      setData,
    ],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const { pages: storePages, focusedPageId } = useEditorStore.getState();
      const target = inferPromptTarget({
        prompt,
        mentionedPageIds: mentions.map((mention) => mention.pageId),
        pages: storePages,
        focusedPageId,
      });
      if (target.kind === "none") return;
      if (target.kind === "pages" && target.droppedCount > 0) {
        toast.message(
          `A run can edit up to ${MAX_PROMPT_TARGET_PAGES} pages, so ${target.droppedCount} ` +
            `${target.droppedCount === 1 ? "page was" : "pages were"} left out.`,
        );
      }

      if (target.kind === "pages") {
        const generated = await startBatchGeneration({
          promptText: prompt,
          targetPageIds: target.pageIds,
          createdPageIds: [],
          modelName: activeModelName,
          generationMode: "information_architecture",
        });

        if (generated) {
          setPrompt("");
        }
        return;
      }

      if (target.kind === "new") {
        try {
          const nextPageNumber = storePages.length + 1;
          const createdPage = await createPageOnServer(`Page ${nextPageNumber}`);
          createPageLocal(
            createdPage.title,
            undefined,
            createdPage.id,
            resolveDeviceIntent(prompt),
          );

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

      const generated = await startGenerationForPage({
        promptText: prompt,
        targetPageId: target.pageId,
      });

      if (generated) {
        setPrompt("");
      }
    },
    [
      createPageLocal,
      createPageOnServer,
      activeModelName,
      mentions,
      prompt,
      reportError,
      setPrompt,
      startBatchGeneration,
      startGenerationForPage,
    ],
  );

  useEffect(() => {
    if (!focusRequestKey) return;

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
  }, [focusRequestKey, promptTextareaRef]);

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

      autoRunRef.current = true;
      sessionStorage.removeItem(`wireModel:${wireId}`);
      sessionStorage.removeItem(`wirePrompt:${wireId}`);

      if (!storedPrompt) return;

      setPrompt("");

      const runInitialBatch = async () => {
        try {
          let firstPageId = useEditorStore.getState().pages[0]?.id;
          if (!firstPageId) {
            const createdFirstPage = await createPageOnServer("Page 1");
            createPageLocal(
              createdFirstPage.title,
              undefined,
              createdFirstPage.id,
            );
            firstPageId = createdFirstPage.id;
          }
          if (!firstPageId) return;

          // Only the first page is created up front. The planner decides how many
          // outputs this brief needs and the server creates the rest.
          await startGenerationForPage({
            promptText: storedPrompt,
            targetPageId: firstPageId,
            modelName: resolvedModel,
            force: true,
          });
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Could not start generation for this brief. Please try again.";
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
    setPrompt,
    wireId,
  ]);

  const handleModelSelection = useCallback((modelId: WireModelName) => {
    setActiveModelName(modelId);
  }, []);

  const [modelFilter, setModelFilter] = useState("");
  const normalizedModelFilter = modelFilter.trim().toLowerCase();
  /** One machine reports hundreds of models; type to narrow, never render all. */
  const matchesModelFilter = useCallback(
    (label: string) =>
      !normalizedModelFilter || label.toLowerCase().includes(normalizedModelFilter),
    [normalizedModelFilter],
  );

  const renderedMessages = useMemo(() => {
    const lastUserMessageIndex = [...messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === "user")?.index;

    const roleLabel = (label: string) => (
      <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">{label}</div>
    );

    return messages.flatMap((message, index) => {
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

      if (message.role === "user") {
        const planningSummary =
          messagePlanningById[key] ??
          ((message as SidebarMessage).planningSummary?.trim() || "");
        const userMessage = (
          <div
            key={key}
            className="whitespace-pre-wrap rounded-lg bg-accent px-3 py-2 text-[13px] leading-5 text-foreground"
          >
            {message.content}
          </div>
        );

        const isPendingLastUser = isLoading && index === lastUserMessageIndex;

        const progressPanel = isPendingLastUser ? (
          <div key={`${key}-progress`} className="border-l border-border pl-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress.stage ? STAGE_LABELS[progress.stage] : "Processing your request…"}
            </div>
            {progress.notice ? (
              <div className="mt-1 text-[11px] text-muted-foreground">{progress.notice}</div>
            ) : null}
            {progress.planItems.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {progress.planItems.map((item) => {
                  const pageStatus = item.pageId
                    ? progress.pageStatusById[item.pageId]
                    : undefined;
                  return (
                    <li key={item.id} className="flex items-center gap-2 text-xs">
                      {pageStatus === "completed" ? (
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      ) : pageStatus === "failed" ? (
                        <X className="h-3 w-3 shrink-0 text-destructive" />
                      ) : (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                      )}
                      <span className="truncate text-foreground">{item.label}</span>
                      {pageStatus ? (
                        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
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

        const planningDetails =
          !isPendingLastUser && planningSummary ? (
            <details key={`${key}-planning`} className="group text-[11px]">
              <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-muted-foreground select-none marker:hidden hover:text-foreground">
                Worked plan
                <span
                  aria-hidden="true"
                  className="text-sm leading-none transition-transform duration-200 group-open:rotate-90"
                >
                  ›
                </span>
              </summary>
              <div className="mt-1 whitespace-pre-wrap leading-4 text-muted-foreground">
                {planningSummary}
              </div>
            </details>
          ) : null;

        const followUp = progressPanel ?? planningDetails;
        return followUp ? [userMessage, followUp] : [userMessage];
      }

      if (message.role === "assistant") {
        const details = getAssistantDetails(message.content);
        if (!details) {
          return [];
        }
        const selectedModelName = modelUsage?.selectedModelName;
        return [
          <div key={key} className="text-[13px] leading-5">
            {roleLabel(selectedModelName ? getModelLabel(selectedModelName) : "Assistant")}
            <div className="leading-relaxed text-foreground">{details}</div>
            {modelUsage?.hasSpecializedStages ? (
              <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                {modelUsage.plannerModelName ? (
                  <span>Plan: {getModelLabel(modelUsage.plannerModelName)}</span>
                ) : null}
                {modelUsage.criticModelName ? (
                  <span>Critic: {getModelLabel(modelUsage.criticModelName)}</span>
                ) : null}
              </div>
            ) : null}
          </div>,
        ];
      }

      return [];
    });
  }, [isLoading, messageModelUsageById, messagePlanningById, messages, progress]);

  const noModelsEnabled = enabledModelIds.length === 0;
  const groupedEnabledModels = useMemo(() => {
    const grouped: Record<WireModelProvider, WireModelOption[]> = {
      google: [],
      openrouter: [],
      zai: [],
    };

    enabledModelIds.forEach((modelId) => {
      const model = WIRE_MODEL_OPTIONS.find((option) => option.id === modelId);
      if (model) grouped[model.provider].push(model);
    });

    return grouped;
  }, [enabledModelIds]);
  const activeModelLabel =
    WIRE_MODEL_OPTIONS.find((model) => model.id === activeModelName)?.label ??
    activeModelName;
  // The @ popover. It is derived from the text and caret on every render, so
  // there is no open flag to fall out of sync; Esc hides it until the caret
  // moves to a different mention.
  const [promptCaret, setPromptCaret] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null);
  const mentionQuery = findMentionQuery(
    prompt,
    promptCaret,
    mentions.map((mention) => mention.label),
  );
  const mentionOptions =
    mentionQuery && mentionQuery.start !== dismissedMentionStart
      ? filterMentionPages(pages, mentionQuery.query)
      : [];
  const isMentionListOpen = mentionOptions.length > 0;
  const activeMentionOption =
    mentionOptions[Math.min(activeMentionIndex, mentionOptions.length - 1)];

  const pickMention = (page: { id: string; title: string }) => {
    const textarea = promptTextareaRef.current;
    if (!mentionQuery || !textarea) return;
    const label = mentionLabel(page);
    const before = prompt.slice(0, mentionQuery.start);
    const after = prompt.slice(promptCaret);
    const inserted = `${label} `;
    const nextPrompt = `${before}${inserted}${after}`;
    setPromptText(nextPrompt);
    setMentions((current) =>
      pruneMentions(nextPrompt, [...current, { pageId: page.id, label }]),
    );
    const caret = before.length + inserted.length;
    setPromptCaret(caret);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMentionListOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveMentionIndex(
          (current) => (current + step + mentionOptions.length) % mentionOptions.length,
        );
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && activeMentionOption) {
        event.preventDefault();
        pickMention(activeMentionOption);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedMentionStart(mentionQuery?.start ?? null);
        return;
      }
    }
  };

  const syncPromptCaret = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    setPromptCaret(event.currentTarget.selectionStart);
  };

  return (
    <aside className="flex h-full w-full flex-col gap-3 bg-transparent p-4 text-foreground">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {renderedMessages}
        {/* The no-models notice below carries the fix, so it replaces this line. */}
        {errorMessage && !noModelsEnabled ? (
          <div className="text-[13px] leading-5">
            <div className="mb-0.5 text-[11px] font-medium text-destructive">Error</div>
            <div className="text-destructive">{errorMessage}</div>
          </div>
        ) : null}
        {qualityNotice ? (
          <div className="text-[13px] leading-5 text-muted-foreground">{qualityNotice}</div>
        ) : null}
        {noModelsEnabled ? (
          <div className="text-[13px] leading-5 text-destructive">
            No models are enabled. Open{" "}
            <Link href="/setting?tab=models" className="underline underline-offset-2">
              Models
            </Link>{" "}
            to enable at least one model.
          </div>
        ) : null}
        {!isLoading && !noModelsEnabled && progress.suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pr-1">
            {progress.suggestions.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSuggestionClick(chip)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
              >
                {chip}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="relative shrink-0">
        {isMentionListOpen ? (
          <ul
            id="prompt-mention-list"
            role="listbox"
            aria-label="Pages"
            className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-card p-1 text-sm shadow-lg"
          >
            {mentionOptions.map((page) => (
              <li
                key={page.id}
                id={`prompt-mention-${page.id}`}
                role="option"
                aria-selected={page.id === activeMentionOption?.id}
                className={`cursor-pointer truncate rounded px-2 py-1 ${
                  page.id === activeMentionOption?.id
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground"
                }`}
                // Picking on mousedown keeps focus in the textarea.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickMention(page);
                }}
              >
                {page.title}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card">
          <textarea
            ref={promptTextareaRef}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setPromptCaret(event.target.selectionStart);
              setActiveMentionIndex(0);
              setDismissedMentionStart(null);
            }}
            onKeyDown={handlePromptKeyDown}
            onSelect={syncPromptCaret}
            onClick={syncPromptCaret}
            onInput={resizePromptTextarea}
            placeholder="Describe a change, @ to pick a page"
            rows={4}
            role="combobox"
            aria-expanded={isMentionListOpen}
            aria-controls={isMentionListOpen ? "prompt-mention-list" : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              isMentionListOpen && activeMentionOption
                ? `prompt-mention-${activeMentionOption.id}`
                : undefined
            }
            className="w-full resize-none bg-transparent px-3 pb-2 pt-3 text-[13px] leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent"
                  disabled={noModelsEnabled}
                >
                  <GeminiIcon className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate">{activeModelLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-border bg-card text-foreground shadow-xl">
                {groupedEnabledModels.google.length +
                  groupedEnabledModels.openrouter.length +
                  groupedEnabledModels.zai.length >
                12 ? (
                  <div className="p-2" onKeyDown={(event) => event.stopPropagation()}>
                    <input
                      value={modelFilter}
                      onChange={(event) => setModelFilter(event.target.value)}
                      placeholder="Search models…"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ) : null}
                {(["google", "openrouter", "zai"] as const).map((provider, index) => {
                  const providerModels = groupedEnabledModels[provider]
                    .filter((model) => matchesModelFilter(model.label))
                    .slice(0, 60);
                  if (providerModels.length === 0) return null;

                  return (
                    <DropdownMenuGroup key={provider}>
                      {index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuLabel className="px-2 py-1.5 text-xs">
                        {WIRE_MODEL_PROVIDER_LABEL[provider]}
                      </DropdownMenuLabel>
                      {providerModels.map((model) => (
                        <DropdownMenuItem
                          key={model.id}
                          onClick={() => handleModelSelection(model.id)}
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
                  <DropdownMenuItem disabled>No models enabled</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {isLoading ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-accent"
                onClick={handleStopGeneration}
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!prompt.trim() || pages.length === 0 || noModelsEnabled}
                size="icon"
                className="h-8 w-8 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-20"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </aside>
  );
}
