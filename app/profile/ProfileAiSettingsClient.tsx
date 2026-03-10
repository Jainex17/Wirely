"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDownIcon,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PencilLine,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import type {
  WireModelName,
  WireModelProvider,
  WireModelTier,
} from "@/lib/wireModels";

interface AiSettingsModel {
  id: WireModelName;
  label: string;
  description: string;
  tier: WireModelTier;
  provider: WireModelProvider;
  enabled: boolean;
}

interface AiSettingsResponse {
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  enabledModelIds: WireModelName[];
  models: AiSettingsModel[];
}

interface ProfileAiSettingsClientProps {
  userName: string | null;
  userEmail: string | null;
}

type ApiKeyProvider = "google" | "openrouter";

type ProfileSettingsTab = "api-keys" | "details";

const PROFILE_SETTINGS_TABS: Array<{
  id: ProfileSettingsTab;
  label: string;
}> = [
  { id: "api-keys", label: "API keys & models" },
  { id: "details", label: "Details" },
];

const tabPanelId = (tabId: ProfileSettingsTab) => `profile-tabpanel-${tabId}`;
const tabId = (tabIdValue: ProfileSettingsTab) => `profile-tab-${tabIdValue}`;

const parseSettingsResponse = (value: unknown): AiSettingsResponse | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.hasGoogleApiKey !== "boolean" ||
    typeof record.hasOpenRouterApiKey !== "boolean" ||
    !Array.isArray(record.enabledModelIds) ||
    !Array.isArray(record.models)
  ) {
    return null;
  }

  const models = record.models.filter(
    (model): model is AiSettingsModel =>
      !!model &&
      typeof model === "object" &&
      !Array.isArray(model) &&
      typeof (model as AiSettingsModel).id === "string" &&
      typeof (model as AiSettingsModel).label === "string" &&
      typeof (model as AiSettingsModel).description === "string" &&
      ((model as AiSettingsModel).tier === "free" ||
        (model as AiSettingsModel).tier === "paid") &&
      ((model as AiSettingsModel).provider === "google" ||
        (model as AiSettingsModel).provider === "openrouter") &&
      typeof (model as AiSettingsModel).enabled === "boolean",
  );

  return {
    hasGoogleApiKey: record.hasGoogleApiKey,
    hasOpenRouterApiKey: record.hasOpenRouterApiKey,
    enabledModelIds: record.enabledModelIds as WireModelName[],
    models,
  };
};

export default function ProfileAiSettingsClient({
  userName,
  userEmail,
}: ProfileAiSettingsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileSettingsTab>("api-keys");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [hasGoogleApiKey, setHasGoogleApiKey] = useState(false);
  const [hasOpenRouterApiKey, setHasOpenRouterApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [displayName, setDisplayName] = useState(userName ?? "");
  const [savedDisplayName, setSavedDisplayName] = useState(userName ?? "");
  const [models, setModels] = useState<AiSettingsModel[]>([]);
  const [apiKeyModalProvider, setApiKeyModalProvider] = useState<ApiKeyProvider | null>(
    null,
  );
  const [showApiKeyValue, setShowApiKeyValue] = useState(false);
  const [googleModelsExpanded, setGoogleModelsExpanded] = useState(true);
  const [openRouterModelsExpanded, setOpenRouterModelsExpanded] = useState(true);

  const enabledModelIds = useMemo(
    () => models.filter((model) => model.enabled).map((model) => model.id),
    [models],
  );
  const detailsChanged = useMemo(
    () => displayName.trim() !== savedDisplayName.trim(),
    [displayName, savedDisplayName],
  );

  useEffect(() => {
    setDisplayName(userName ?? "");
    setSavedDisplayName(userName ?? "");
  }, [userName, userEmail]);

  const applySettings = useCallback((payload: AiSettingsResponse) => {
    setHasGoogleApiKey(payload.hasGoogleApiKey);
    setHasOpenRouterApiKey(payload.hasOpenRouterApiKey);
    setModels(payload.models);
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to load AI settings.");
      }
      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load AI settings right now.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const closeApiKeyModal = () => {
    setApiKeyModalProvider(null);
    setApiKeyInput("");
  };

  const openApiKeyModal = (provider: ApiKeyProvider) => {
    setApiKeyModalProvider(provider);
    setApiKeyInput("");
    setShowApiKeyValue(false);
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyModalProvider) return;

    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      toast.error(
        apiKeyModalProvider === "google"
          ? "Enter a Google API key."
          : "Enter an OpenRouter API key.",
      );
      return;
    }

    setIsSavingKey(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          apiKeyModalProvider === "google"
            ? { googleApiKey: trimmed }
            : { openRouterApiKey: trimmed },
        ),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to save API key.");
      }

      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
      setApiKeyInput("");
      toast.success(
        apiKeyModalProvider === "google"
          ? "Google API key saved."
          : "OpenRouter API key saved.",
      );
      closeApiKeyModal();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save API key.",
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!apiKeyModalProvider) return;

    setIsSavingKey(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          apiKeyModalProvider === "google"
            ? { clearGoogleApiKey: true }
            : { clearOpenRouterApiKey: true },
        ),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to clear API key.");
      }
      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
      setApiKeyInput("");
      toast.success(
        apiKeyModalProvider === "google"
          ? "Google API key removed."
          : "OpenRouter API key removed.",
      );
      closeApiKeyModal();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to clear API key.",
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  const persistEnabledModels = async (nextEnabledModelIds: WireModelName[]) => {
    setIsSavingModels(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabledModelIds: nextEnabledModelIds,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to update model settings.");
      }
      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
      toast.success("Model settings updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update models.",
      );
    } finally {
      setIsSavingModels(false);
    }
  };

  const toggleModel = (modelId: WireModelName) => {
    const nextEnabledModelIds = models
      .map((model) =>
        model.id === modelId ? { ...model, enabled: !model.enabled } : model,
      )
      .filter((model) => model.enabled)
      .map((model) => model.id);
    void persistEnabledModels(nextEnabledModelIds);
  };

  const handleSaveDetails = async () => {
    if (isSavingDetails || !detailsChanged) return;

    setIsSavingDetails(true);
    try {
      const response = await fetch("/api/profile/details", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: displayName,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to save profile details.");
      }

      const payload = (await response.json()) as {
        name?: string | null;
      };
      const nextName = (payload.name ?? "").trim();
      setDisplayName(nextName);
      setSavedDisplayName(nextName);
      toast.success("Profile details saved.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save details.",
      );
    } finally {
      setIsSavingDetails(false);
    }
  };

  const renderDetailsTab = () => (
    <section
      id={tabPanelId("details")}
      role="tabpanel"
      aria-labelledby={tabId("details")}
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <PencilLine className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Profile details
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit your display information.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Name
          </p>
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            disabled={isSavingDetails}
          />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Email
          </p>
          <Input
            value={userEmail ?? ""}
            placeholder="you@example.com"
            type="email"
            disabled
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          onClick={handleSaveDetails}
          disabled={!detailsChanged || isSavingDetails}
        >
          {isSavingDetails ? "Saving..." : "Save details"}
        </Button>
      </div>
    </section>
  );

  const renderModelsContent = () => {
    const googleModels = models.filter((model) => model.provider === "google");
    const openRouterModels = models.filter(
      (model) => model.provider === "openrouter",
    );

    const renderModelRow = (model: AiSettingsModel) => (
      <div
        key={model.id}
        className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{model.label}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {model.description} • {model.tier}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={model.enabled}
          aria-label={`${model.enabled ? "Disable" : "Enable"} ${model.label}`}
          onClick={() => toggleModel(model.id)}
          disabled={isLoading || isSavingModels}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            model.enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              model.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );

    const renderProviderModelsSection = ({
      title,
      modelsForProvider,
      expanded,
      setExpanded,
      onManageKey,
    }: {
      title: string;
      modelsForProvider: AiSettingsModel[];
      expanded: boolean;
      setExpanded: (next: boolean) => void;
      onManageKey?: () => void;
    }) => (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setExpanded(!expanded);
            }
          }}
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
        >
          <p className="text-sm font-medium text-foreground">{title}</p>
          <div className="flex items-center gap-2">
            {onManageKey ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onManageKey();
                }}
                className="h-7 px-2 text-xs"
              >
                Manage key
              </Button>
            ) : null}
            <ChevronDownIcon
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        {expanded ? (
          <div className="space-y-2 border-t border-border p-3">
            {modelsForProvider.map(renderModelRow)}
          </div>
        ) : null}
      </div>
    );

    if (isLoading) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading models...</span>
          </div>
        </div>
      );
    }

    return (
      <>
        {isSavingModels ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving model changes...
          </div>
        ) : null}

        <div className="space-y-3">
          {googleModels.length > 0
            ? renderProviderModelsSection({
                title: "Google models",
                modelsForProvider: googleModels,
                expanded: googleModelsExpanded,
                setExpanded: setGoogleModelsExpanded,
                onManageKey: () => openApiKeyModal("google"),
              })
            : null}

          {openRouterModels.length > 0
            ? renderProviderModelsSection({
                title: "OpenRouter models",
                modelsForProvider: openRouterModels,
                expanded: openRouterModelsExpanded,
                setExpanded: setOpenRouterModelsExpanded,
                onManageKey: () => openApiKeyModal("openrouter"),
              })
            : null}
        </div>

        {enabledModelIds.length === 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            No models are enabled. Enable at least one model to generate pages.
          </p>
        ) : null}
      </>
    );
  };

  const renderApiKeysTab = () => {
    if (isLoading) {
      return (
        <section
          id={tabPanelId("api-keys")}
          role="tabpanel"
          aria-labelledby={tabId("api-keys")}
          className="space-y-4"
        >
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                <div className="h-3 w-48 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        </section>
      );
    }

    const googleModels = models.filter((model) => model.provider === "google");
    const openRouterModels = models.filter((model) => model.provider === "openrouter");
    const googleEnabledModels = googleModels.filter((model) => model.enabled).length;
    const openRouterEnabledModels = openRouterModels.filter((model) => model.enabled).length;
    const configuredProvidersCount = Number(hasGoogleApiKey) + Number(hasOpenRouterApiKey);

    return (
      <section
        id={tabPanelId("api-keys")}
        role="tabpanel"
        aria-labelledby={tabId("api-keys")}
        className="space-y-4"
      >
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Configure provider API keys in modal, then enable the models you want.
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              {configuredProvidersCount}/2 providers configured
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div
            className={`rounded-lg border bg-card p-4 ${
              hasGoogleApiKey ? "border-emerald-500/30" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Google AI</h3>
                  <p className="text-sm text-muted-foreground">
                    {hasGoogleApiKey ? "API key configured" : "API key missing"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {googleEnabledModels}/{googleModels.length} models enabled
                  </p>
                </div>
              </div>
              {hasGoogleApiKey ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => openApiKeyModal("google")}>
                {hasGoogleApiKey ? "Manage key" : "Add key"}
              </Button>
            </div>
          </div>

          <div
            className={`rounded-lg border bg-card p-4 ${
              hasOpenRouterApiKey ? "border-emerald-500/30" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">OpenRouter</h3>
                  <p className="text-sm text-muted-foreground">
                    {hasOpenRouterApiKey ? "API key configured" : "API key missing"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {openRouterEnabledModels}/{openRouterModels.length} models enabled
                  </p>
                </div>
              </div>
              {hasOpenRouterApiKey ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openApiKeyModal("openrouter")}
              >
                {hasOpenRouterApiKey ? "Manage key" : "Add key"}
              </Button>
            </div>
          </div>
        </div>

        {!hasGoogleApiKey || !hasOpenRouterApiKey ? (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-amber-700">
            Missing provider keys can block generation for models that depend on them.
          </p>
        ) : null}

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Models</h3>
              <p className="text-sm text-muted-foreground">Turn models on or off.</p>
            </div>
          </div>
          <div className="mt-3">
            {renderModelsContent()}
          </div>
        </div>
      </section>
    );
  };

  const activeProviderLabel =
    apiKeyModalProvider === "openrouter"
      ? "OpenRouter"
      : apiKeyModalProvider === "google"
        ? "Google"
        : "Provider";
  const activeProviderHasKey =
    apiKeyModalProvider === "google"
      ? hasGoogleApiKey
      : apiKeyModalProvider === "openrouter"
        ? hasOpenRouterApiKey
        : false;
  const activeProviderPlaceholder =
    apiKeyModalProvider === "openrouter"
      ? "Paste your OpenRouter API key (e.g., sk-or-v1-...)"
      : "Paste your Google API key (e.g., AIza...)";
  const activeProviderLearnMoreUrl =
    apiKeyModalProvider === "openrouter"
      ? "https://openrouter.ai/keys"
      : "https://aistudio.google.com/app/apikey";

  const renderApiKeyModal = () => (
    <Dialog
      open={apiKeyModalProvider !== null}
      onOpenChange={(open) => {
        if (!open && !isSavingKey) {
          closeApiKeyModal();
        }
      }}
    >
      <DialogContent className="border-border bg-card" showCloseButton={!isSavingKey}>
        <DialogHeader>
          <DialogTitle>{activeProviderLabel} API key</DialogTitle>
          <DialogDescription>
            Add or update your {activeProviderLabel} API key here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Input
              type={showApiKeyValue ? "text" : "password"}
              placeholder={activeProviderPlaceholder}
              value={apiKeyInput}
              autoFocus
              onChange={(event) => setApiKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && apiKeyInput.trim().length > 0 && !isSavingKey) {
                  event.preventDefault();
                  void handleSaveApiKey();
                }
              }}
              disabled={isSavingKey}
              className="pr-11 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowApiKeyValue((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={showApiKeyValue ? "Hide API key" : "Show API key"}
            >
              {showApiKeyValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Press Enter to save quickly.</p>
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an API key?{" "}
              <a
                href={activeProviderLearnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Get one now
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            {activeProviderHasKey ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleClearApiKey}
                disabled={isSavingKey}
                className="text-destructive hover:text-destructive"
              >
                Remove key
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={closeApiKeyModal}
              disabled={isSavingKey}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveApiKey}
              disabled={isSavingKey || apiKeyInput.trim().length === 0}
            >
              {isSavingKey ? "Saving..." : activeProviderHasKey ? "Update key" : "Save key"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="mt-5 space-y-4">
      <div className="border-b border-border/70">
        <div
          role="tablist"
          aria-label="Profile settings tabs"
          className="flex flex-wrap items-center gap-1"
        >
          {PROFILE_SETTINGS_TABS.map((tab) => (
            <Button
              key={tab.id}
              id={tabId(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={tabPanelId(tab.id)}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-none border-b-2 px-3 whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {activeTab === "api-keys" ? renderApiKeysTab() : null}
      {activeTab === "details" ? renderDetailsTab() : null}
      {renderApiKeyModal()}
    </div>
  );
}
