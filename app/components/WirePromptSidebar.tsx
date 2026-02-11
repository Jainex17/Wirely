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
import { Eye, History, MessageSquare, RefreshCw, RotateCcw } from "lucide-react";
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

type RepairResponse = {
  content?: string;
  fallbackUsed?: boolean;
  stylePresetId?: string;
  modelName?: string;
};

type ProjectVersion = {
  id: string;
  promptText: string | null;
  assistantDetails: string | null;
  htmlContent: string;
  stylePresetId: string | null;
  modelName: string | null;
  violationCount: number;
  isRepair: boolean;
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
  const [isPolishing, setIsPolishing] = useState(false);
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
  const setPageHtml = useEditorStore((state) => state.setPageHtml);

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
      isRepair,
    }: {
      promptText?: string;
      assistantContent: string;
      htmlContent: string;
      modelName?: string;
      stylePresetId?: string;
      violationCount?: number;
      isRepair: boolean;
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
            isRepair,
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
      setErrorMessage(
        `Generation failed with ${activeModelName}. Try another model.`,
      );
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
        setErrorMessage(
          "Generated output was not renderable. Try a more specific prompt.",
        );
        return;
      }

      setPageHtml(targetPageId, initialNormalized.html, "Generated Page");
      setQualityNotice(null);

      await persistVersion({
        promptText: activePrompt,
        assistantContent: message.content,
        htmlContent: initialNormalized.html,
        modelName: activeModelName,
        stylePresetId: stylePreset.id,
        violationCount: initialQuality.violations.length,
        isRepair: false,
      });

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
        const repairResponse = await fetch(`/api/projects/${wireId}/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            wireId,
            modelName: activeModelName,
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
          const failureText = (await repairResponse.text()).trim();
          throw new Error(
            failureText ||
              `Repair failed with ${activeModelName}. Try another model.`,
          );
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

        await persistVersion({
          promptText: activePrompt,
          assistantContent: payload.content ?? "",
          htmlContent: shouldUseRepairedVersion
            ? repairedNormalized.html
            : initialNormalized.html,
          modelName: payload.modelName,
          stylePresetId: payload.stylePresetId ?? stylePreset.id,
          violationCount: repairedQuality.violations.length,
          isRepair: true,
        });

        if (!shouldUseRepairedVersion || payload.fallbackUsed) {
          setQualityNotice(
            "Auto-polish fallback kept output stable; regenerate for a different direction.",
          );
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : `Repair failed with ${activeModelName}. Try another model.`;
        setErrorMessage(message);
        setQualityNotice("Repair skipped after selected model failure.");
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
      setErrorMessage(null);
      setPrompt("");
      await append(
        { role: "user", content: trimmed },
        { body: { modelName: activeModelName } },
      );
    },
    [activeModelName, append, isLoading, isPolishing, prompt],
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
          violationCount: version.violationCount,
          isRepair: false,
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
  }, [messages]);

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
            {isLoading ? (
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                variant === "panel"
                  ? "bg-muted text-muted-foreground"
                  : "bg-neutral-800/40 text-neutral-200"
              }`}>
                Generating...
              </div>
            ) : null}
            {isPolishing ? (
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                variant === "panel"
                  ? "bg-muted text-muted-foreground"
                  : "bg-neutral-800/40 text-neutral-200"
              }`}>
                Polishing design...
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
                  disabled={isLoading || isPolishing || !prompt.trim()}
                  size="sm"
                  className={`h-7 px-3 rounded-md text-xs font-medium transition-all ${
                    variant === "panel"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      : "bg-neutral-200 text-neutral-900 hover:bg-white disabled:opacity-40"
                  }`}
                  aria-label="Send"
                >
                  {isLoading || isPolishing ? "..." : "Send"}
                </Button>
              </div>
              <div className={`flex items-center justify-end px-3 py-1.5 border-t ${
                variant === "panel" ? "border-border/40 bg-muted/30" : "border-white/5 bg-neutral-900/40"
              }`}>
                <select
                  value={activeModelName}
                  onChange={(event) =>
                    setActiveModelName(event.target.value as WireModelName)
                  }
                  disabled={isLoading || isPolishing}
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
                  <div className={`flex items-center gap-2 text-xs ${variant === "panel" ? "text-muted-foreground" : "text-neutral-400"}`}>
                    {version.isRepair ? (
                      <span className={`rounded px-2 py-0.5 ${
                        variant === "panel" ? "bg-secondary" : "bg-white/10"
                      }`}>
                        Repair
                      </span>
                    ) : null}

                  </div>
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
