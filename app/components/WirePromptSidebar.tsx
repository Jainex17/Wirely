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
  CopyPlus,
  Eye,
  History,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  violationCount: number;
  createdAt: string;
};

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
  const autoRunRef = useRef(false);
  const latestPromptRef = useRef("");
  const pendingTargetPageIdRef = useRef<string | null>(null);
  const pendingCreatedPageIdRef = useRef<string | null>(null);
  const setPageHtml = useEditorStore((state) => state.setPageHtml);
  const createPage = useEditorStore((state) => state.createPage);
  const deletePage = useEditorStore((state) => state.deletePage);
  const pageCount = useEditorStore((state) => state.pages.length);

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
      violationCount,
      pageId,
      pageTitle,
    }: {
      promptText?: string;
      assistantContent: string;
      htmlContent: string;
      modelName?: string;
      stylePresetId?: string;
      violationCount?: number;
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
            violationCount,
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
        rollbackPendingNewPage();
        setErrorMessage(
          text?.trim() ||
            `Generation failed with ${activeModelName}. Try another model.`,
        );
        stop();
        return;
      }
      setErrorMessage(null);
    },
    onError: () => {
      rollbackPendingNewPage();
      setErrorMessage(
        `Generation failed with ${activeModelName}. Try another model.`,
      );
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
          modelName: activeModelName,
          stylePresetId: stylePreset.id,
          violationCount: initialQuality.violations.length,
          pageId: targetPageId,
          pageTitle: targetPage?.title,
        });

        console.info("[wire] quality_gate", {
          stage: "initial",
          score: initialQuality.score,
          violationCount: initialQuality.violations.length,
        });
      } finally {
        clearPendingGeneration();
      }
    },
  });

  const startGeneration = useCallback(
    async ({
      promptText,
      mode,
    }: {
      promptText: string;
      mode: "replace-first-page" | "new-page";
    }) => {
      if (isLoading) return;

      const trimmedPrompt = promptText.trim();
      if (!trimmedPrompt) return;

      let targetPageId: string | null = null;
      pendingCreatedPageIdRef.current = null;

      if (mode === "new-page") {
        const nextPageNumber = useEditorStore.getState().pages.length + 1;
        targetPageId = createPage(`Generated Page ${nextPageNumber}`);
        pendingCreatedPageIdRef.current = targetPageId;
      } else {
        targetPageId = useEditorStore.getState().pages[0]?.id ?? null;
      }

      if (!targetPageId) {
        clearPendingGeneration();
        return;
      }

      pendingTargetPageIdRef.current = targetPageId;
      latestPromptRef.current = trimmedPrompt;
      setQualityNotice(null);
      setErrorMessage(null);
      setPrompt("");

      try {
        await append(
          { role: "user", content: trimmedPrompt },
          { body: { modelName: activeModelName } },
        );
      } catch (error) {
        rollbackPendingNewPage();
        throw error;
      }
    },
    [
      activeModelName,
      append,
      clearPendingGeneration,
      createPage,
      isLoading,
      rollbackPendingNewPage,
    ],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await startGeneration({
        promptText: prompt,
        mode: "replace-first-page",
      });
    },
    [prompt, startGeneration],
  );

  const latestUserPrompt = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "user" && message.content.trim()) {
        return message.content.trim();
      }
    }
    return "";
  }, [messages]);

  const handleGenerateNewPage = useCallback(async () => {
    await startGeneration({
      promptText: prompt,
      mode: "new-page",
    });
  }, [prompt, startGeneration]);

  const handleGenerateNewPageFromLastPrompt = useCallback(async () => {
    await startGeneration({
      promptText: latestUserPrompt,
      mode: "new-page",
    });
  }, [latestUserPrompt, startGeneration]);

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
          violationCount: version.violationCount,
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
    autoRunRef.current = true;
    if (!storedPrompt) return;
    latestPromptRef.current = storedPrompt;
    sessionStorage.removeItem(`wirePrompt:${wireId}`);
    setPrompt("");
    void append(
      { role: "user", content: storedPrompt },
      { body: { modelName: resolvedModel } },
    );
  }, [activeModelName, append, wireId]);

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
      <div className={`grid grid-cols-2 rounded-xl border p-1 ${
        variant === "panel" ? "border-border bg-muted" : "border-white/10"
      }`}>
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
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {renderedMessages}
            {errorMessage ? (
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                variant === "panel"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-neutral-800/60 text-neutral-100"
              }`}>
                {errorMessage}
              </div>
            ) : null}
            {qualityNotice ? (
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                variant === "panel"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-neutral-800/60 text-neutral-100"
              }`}>
                {qualityNotice}
              </div>
            ) : null}
            {isLoading ? (
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                variant === "panel"
                  ? "bg-muted text-muted-foreground"
                  : "bg-neutral-800/40 text-neutral-200"
              }`}>
                Generating...
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="shrink-0">
            <div className={`rounded-xl border ${
              variant === "panel"
                ? "border-border bg-card shadow-sm"
                : "border-white/10 bg-neutral-900/60"
            }`}>
              <div className="flex items-end gap-2 px-3 py-2">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask..."
                  rows={1}
                  className={`flex-1 resize-none border-none bg-transparent py-1.5 text-sm leading-5 focus:outline-none focus:ring-0 min-h-[28px] ${
                    variant === "panel"
                      ? "text-foreground placeholder:text-muted-foreground/60"
                      : "text-neutral-100 placeholder:text-neutral-500"
                  }`}
                />
                <Button
                  type="submit"
                  disabled={isLoading || !prompt.trim()}
                  size="sm"
                  className={`h-7 px-3 rounded-md text-xs font-medium transition-all ${
                    variant === "panel"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      : "bg-neutral-200 text-neutral-900 hover:bg-white disabled:opacity-40"
                  }`}
                  aria-label="Send"
                >
                  {isLoading ? "..." : "Send"}
                </Button>
              </div>
              <div className={`px-3 pb-2 flex items-center justify-between gap-2 ${
                variant === "panel"
                  ? "text-muted-foreground"
                  : "text-neutral-400"
              }`}>
                <p className="text-[10px]">
                  {pageCount} page{pageCount === 1 ? "" : "s"} on canvas
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleGenerateNewPage()}
                    disabled={isLoading || !prompt.trim()}
                    className={`h-7 px-2.5 text-[11px] ${
                      variant === "panel"
                        ? "border-border bg-transparent text-foreground hover:bg-accent"
                        : "border-white/20 bg-transparent text-neutral-100 hover:bg-white/10"
                    }`}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    New page
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleGenerateNewPageFromLastPrompt()}
                    disabled={isLoading || !latestUserPrompt}
                    className={`h-7 px-2.5 text-[11px] ${
                      variant === "panel"
                        ? "border-border bg-transparent text-foreground hover:bg-accent"
                        : "border-white/20 bg-transparent text-neutral-100 hover:bg-white/10"
                    }`}
                    title={
                      latestUserPrompt
                        ? "Create a new page with your last prompt"
                        : "Generate once to enable same-prompt page creation"
                    }
                  >
                    <CopyPlus className="mr-1 h-3 w-3" />
                    Same prompt
                  </Button>
                </div>
              </div>
              <div className={`flex items-center justify-end px-3 py-1.5 border-t ${
                variant === "panel" ? "border-border/40 bg-muted/30" : "border-white/5 bg-neutral-900/40"
              }`}>
                <select
                  value={activeModelName}
                  onChange={(event) =>
                    setActiveModelName(event.target.value as WireModelName)
                  }
                  disabled={isLoading}
                  className={`h-6 px-1.5 text-[10px] rounded border bg-transparent outline-none cursor-pointer transition-colors ${
                    variant === "panel"
                      ? "border-border text-muted-foreground hover:border-muted-foreground/50"
                      : "border-white/10 text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  <optgroup label="Gemini">
                    {geminiModelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="OpenRouter">
                    {openRouterModelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          </form>
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="mb-3 flex items-center justify-between">
            <p className={`text-sm ${variant === "panel" ? "text-muted-foreground" : "text-neutral-300"}`}>Saved generations</p>
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
            <div className={`rounded-xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-destructive/10 text-destructive"
                : "bg-neutral-800/60 text-neutral-200"
            }`}>
              {versionError}
            </div>
          ) : null}

          {!versionError && versions.length === 0 && !isLoadingVersions ? (
            <div className={`rounded-xl px-4 py-3 text-sm ${
              variant === "panel"
                ? "bg-muted text-muted-foreground"
                : "bg-neutral-800/40 text-neutral-300"
            }`}>
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
                  <p className={`text-xs ${variant === "panel" ? "text-muted-foreground" : "text-neutral-400"}`}>
                    {formatTimestamp(version.createdAt)}
                  </p>
                </div>

                <p className={`line-clamp-2 text-sm ${variant === "panel" ? "text-foreground" : "text-neutral-200"}`}>
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
                    {restoringVersionId === version.id
                      ? "Restoring"
                      : "Restore"}
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
