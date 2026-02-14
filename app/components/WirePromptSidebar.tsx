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
  Eye,
  History,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
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
import PagePreviewModal from "@/app/components/PagePreviewModal";
import {
  normalizeGeneratedHtml,
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

type ProjectVersion = {
  id: string;
  promptText: string | null;
  assistantDetails: string | null;
  htmlContent: string;
  stylePresetId: string | null;
  modelName: string | null;
  createdAt: string;
};

type GenerationVariation = {
  variationIndex: number;
  variationCount: number;
  variationThemeHint: string;
};

const VARIATION_THEME_HINTS = [
  "Editorial minimal layout with restrained monochrome palette and precise typography.",
  "Bold geometric composition with high contrast neon accents and kinetic visual rhythm.",
  "Warm handcrafted aesthetic with organic forms, textured surfaces, and soft tones.",
] as const;

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

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

export default function WirePromptSidebar({
  wireId,
  variant = "floating",
  initialModelName = DEFAULT_WIRE_MODEL,
  initialMessages = [],
}: WirePromptSidebarProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "versions">("chat");
  const [prompt, setPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(
    null,
  );
  const [previewVersion, setPreviewVersion] = useState<ProjectVersion | null>(
    null,
  );
  const [activeModelName, setActiveModelName] =
    useState<WireModelName>(initialModelName);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const autoRunRef = useRef(false);
  const latestPromptRef = useRef("");
  const pendingTargetPageIdRef = useRef<string | null>(null);
  const pendingCreatedPageIdRef = useRef<string | null>(null);
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
  }, []);

  const rollbackPendingNewPage = useCallback(() => {
    const pendingCreatedPageId = pendingCreatedPageIdRef.current;
    if (pendingCreatedPageId) {
      deletePage(pendingCreatedPageId);
    }
    clearPendingGeneration();
  }, [clearPendingGeneration, deletePage]);

  const loadVersions = useCallback(async () => {
    setIsLoadingVersions(true);
    setVersionError(null);

    try {
      const response = await fetch(`/api/projects/${wireId}/versions`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to load versions.");
      }

      const payload = (await response.json()) as {
        versions?: ProjectVersion[];
      };
      setVersions(payload.versions ?? []);
    } catch {
      setVersionError("Failed to load version history.");
    } finally {
      setIsLoadingVersions(false);
    }
  }, [wireId]);

  const persistVersion = useCallback(
    async ({
      promptText,
      assistantContent,
      htmlContent,
      modelName,
      stylePresetId,
      pageId,
      pageTitle,
    }: {
      promptText?: string;
      assistantContent: string;
      htmlContent: string;
      modelName?: string;
      stylePresetId?: string;
      pageId?: string;
      pageTitle?: string;
    }) => {
      try {
        const response = await fetch(`/api/projects/${wireId}/versions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            promptText: promptText ?? latestPromptRef.current,
            assistantContent,
            htmlContent,
            modelName,
            stylePresetId,
            pageId,
            pageTitle,
          }),
        });

        if (response.ok) {
          await loadVersions();
        }
      } catch (error) {
        console.error("[wire] version_persist_failed", error);
      }
    },
    [loadVersions, wireId],
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
        rollbackPendingNewPage();
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
      rollbackPendingNewPage();
      setErrorMessage(failureMessage);
      stop();
    },
    onFinish: async (message) => {
      const targetPageId =
        pendingTargetPageIdRef.current ?? useEditorStore.getState().pages[0]?.id;
      if (!targetPageId) {
        clearPendingGeneration();
        return;
      }

      try {
        const targetPage = useEditorStore
          .getState()
          .pages.find((page) => page.id === targetPageId);
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
          rollbackPendingNewPage();
          setErrorMessage(
            "Generated output was not renderable. Try a more specific prompt.",
          );
          return;
        }

        setPageHtml(targetPageId, initialNormalized.html);
        setQualityNotice(null);

        await persistVersion({
          promptText: activePrompt,
          assistantContent: message.content,
          htmlContent: initialNormalized.html,
          modelName: pendingModelNameRef.current,
          stylePresetId: stylePreset.id,
          pageId: targetPageId,
          pageTitle: targetPage?.title,
        });

        console.info("[wire] quality_gate", {
          stage: "initial",
          score: initialQuality.score,
          violations: initialQuality.violations.length,
          variationIndex: undefined,
        });
      } finally {
        clearPendingGeneration();
      }
    },
  });

  const startGenerationForPage = useCallback(
    async ({
      promptText,
      targetPageId,
      createdPageId,
      variation,
      modelName,
      force,
    }: {
      promptText: string;
      targetPageId: string;
      createdPageId?: string;
      variation?: GenerationVariation;
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
      pendingModelNameRef.current = selectedModel;
      pendingGenerationFailedRef.current = false;
      pendingGenerationErrorRef.current = null;
      latestPromptRef.current = trimmedPrompt;
      setQualityNotice(null);
      setErrorMessage(null);

      const body: Record<string, unknown> = {
        modelName: selectedModel,
      };

      if (variation && variation.variationCount > 1) {
        body.variationIndex = variation.variationIndex;
        body.variationCount = variation.variationCount;
        body.variationThemeHint = variation.variationThemeHint;
      }

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
        rollbackPendingNewPage();
        throw error;
      }
    },
    [activeModelName, append, isLoading, rollbackPendingNewPage],
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

  const handleRestoreVersion = useCallback(
    async (version: ProjectVersion) => {
      const targetPageId = useEditorStore.getState().pages[0]?.id;
      if (!targetPageId) return;

      setRestoringVersionId(version.id);
      try {
        setPageHtml(targetPageId, version.htmlContent, "Generated Page");
        setQualityNotice(
          `Restored version from ${formatTimestamp(version.createdAt)}.`,
        );

        await persistVersion({
          promptText: `Restored version ${version.id}`,
          assistantContent: `Manual restore from version ${version.id}`,
          htmlContent: version.htmlContent,
          stylePresetId: version.stylePresetId ?? undefined,
          pageId: targetPageId,
          pageTitle: "Generated Page",
        });
      } finally {
        setRestoringVersionId(null);
      }
    },
    [persistVersion, setPageHtml],
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

    const storedModel = sessionStorage.getItem(`wireModel:${wireId}`);
    const resolvedModel = isWireModelName(storedModel)
      ? storedModel
      : activeModelName;
    if (isWireModelName(storedModel)) {
      setActiveModelName(storedModel);
    }
    sessionStorage.removeItem(`wireModel:${wireId}`);

    const storedPrompt = sessionStorage.getItem(`wirePrompt:${wireId}`);
    const storedPageCount = parseStoredPageCount(
      sessionStorage.getItem(`wirePageCount:${wireId}`),
    );

    autoRunRef.current = true;
    sessionStorage.removeItem(`wirePrompt:${wireId}`);
    sessionStorage.removeItem(`wirePageCount:${wireId}`);

    if (!storedPrompt) return;

    setPrompt("");

    const runInitialBatch = async () => {
      let firstPageId = useEditorStore.getState().pages[0]?.id;
      if (!firstPageId) {
        firstPageId = createPage("Generated Page 1");
      }
      if (!firstPageId) return;

      const targets: Array<{ pageId: string; isCreated: boolean }> = [
        { pageId: firstPageId, isCreated: false },
      ];

      for (let index = 1; index < storedPageCount; index += 1) {
        const nextPageNumber = useEditorStore.getState().pages.length + 1;
        const createdId = createPage(`Generated Page ${nextPageNumber}`);
        targets.push({ pageId: createdId, isCreated: true });
      }

      let failedCount = 0;
      let successCount = 0;

      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];

        try {
          const completed = await startGenerationForPage({
            promptText: storedPrompt,
            targetPageId: target.pageId,
            createdPageId: target.isCreated ? target.pageId : undefined,
            modelName: resolvedModel,
            force: true,
            variation:
              storedPageCount > 1
                ? {
                    variationIndex: index + 1,
                    variationCount: storedPageCount,
                    variationThemeHint: VARIATION_THEME_HINTS[index] ??
                      VARIATION_THEME_HINTS[VARIATION_THEME_HINTS.length - 1],
                  }
                : undefined,
          });

          if (completed) {
            successCount += 1;
          }
        } catch {
          failedCount += 1;
        }
      }

      if (failedCount > 0) {
        setErrorMessage(
          `${failedCount} of ${storedPageCount} requested variations failed. ${successCount} generated successfully.`,
        );
      }
    };

    void runInitialBatch();
  }, [activeModelName, createPage, startGenerationForPage, wireId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

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
        const parsed = parseWireOutput(message.content);
        const details = parsed.details;
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
      <div
        className={`grid grid-cols-2 rounded-xl border p-1 ${
          variant === "panel" ? "border-border bg-muted" : "border-white/10"
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            activeTab === "chat"
              ? variant === "panel"
                ? "bg-primary text-primary-foreground"
                : "bg-neutral-200 text-neutral-900"
              : variant === "panel"
                ? "text-muted-foreground hover:bg-accent"
                : "text-neutral-300 hover:bg-white/5"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("versions")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            activeTab === "versions"
              ? variant === "panel"
                ? "bg-primary text-primary-foreground"
                : "bg-neutral-200 text-neutral-900"
              : variant === "panel"
                ? "text-muted-foreground hover:bg-accent"
                : "text-neutral-300 hover:bg-white/5"
          }`}
        >
          <History className="h-4 w-4" />
          Versions
        </button>
      </div>

      {activeTab === "chat" ? (
        <>
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
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="mb-3 flex items-center justify-between">
            <p
              className={`text-sm ${variant === "panel" ? "text-muted-foreground" : "text-neutral-300"}`}
            >
              Saved generations
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void loadVersions()}
              disabled={isLoadingVersions}
              className={`h-8 w-8 ${
                variant === "panel"
                  ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              }`}
              title="Refresh versions"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoadingVersions ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          {versionError ? (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                variant === "panel"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-neutral-800/60 text-neutral-200"
              }`}
            >
              {versionError}
            </div>
          ) : null}

          {!versionError && versions.length === 0 && !isLoadingVersions ? (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                variant === "panel"
                  ? "bg-muted text-muted-foreground"
                  : "bg-neutral-800/40 text-neutral-300"
              }`}
            >
              No versions yet. Generate a page to start history.
            </div>
          ) : null}

          <div className="space-y-2">
            {versions.map((version) => (
              <div
                key={version.id}
                className={`rounded-xl border px-3 py-3 ${
                  variant === "panel"
                    ? "border-border bg-card"
                    : "border-white/10 bg-neutral-900/40"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p
                    className={`text-xs ${variant === "panel" ? "text-muted-foreground" : "text-neutral-400"}`}
                  >
                    {formatTimestamp(version.createdAt)}
                  </p>
                </div>

                <p
                  className={`line-clamp-2 text-sm ${variant === "panel" ? "text-foreground" : "text-neutral-200"}`}
                >
                  {version.promptText?.trim() ||
                    version.assistantDetails?.trim() ||
                    "Generated variation"}
                </p>

                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewVersion(version)}
                    className={`h-8 ${
                      variant === "panel"
                        ? "border-border bg-transparent text-foreground hover:bg-accent"
                        : "border-white/20 bg-transparent text-neutral-100 hover:bg-white/10"
                    }`}
                  >
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleRestoreVersion(version)}
                    disabled={restoringVersionId === version.id}
                    className={`h-8 ${
                      variant === "panel"
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-neutral-200 text-neutral-900 hover:bg-white"
                    }`}
                  >
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    {restoringVersionId === version.id ? "Restoring" : "Restore"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <PagePreviewModal
        isOpen={previewVersion !== null}
        onClose={() => setPreviewVersion(null)}
        page={
          previewVersion
            ? {
                title: `Version ${formatTimestamp(previewVersion.createdAt)}`,
                iframeHtml: previewVersion.htmlContent,
              }
            : null
        }
      />
    </aside>
  );
}
