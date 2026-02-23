"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, KeyRound, PencilLine, Sparkles, Zap, Server, ExternalLink, ChevronDownIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
        (model as AiSettingsModel).provider === "openrouter" ||
        (model as AiSettingsModel).provider === "opencode") &&
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
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [displayName, setDisplayName] = useState(userName ?? "");
  const [savedDisplayName, setSavedDisplayName] = useState(userName ?? "");
  const [models, setModels] = useState<AiSettingsModel[]>([]);
  const [opencodeEnabled, setOpencodeEnabled] = useState(false);
  const [opencodeStatus, setOpencodeStatus] = useState<"inactive" | "checking" | "active" | "running">("inactive");
  const [showOpencodeModal, setShowOpencodeModal] = useState(false);
  const [showGoogleConfig, setShowGoogleConfig] = useState(false);
  const [showOpenRouterConfig, setShowOpenRouterConfig] = useState(false);
  const [googleModelsExpanded, setGoogleModelsExpanded] = useState(true);
  const [openRouterModelsExpanded, setOpenRouterModelsExpanded] = useState(true);
  const [opencodeModelsExpanded, setOpencodeModelsExpanded] = useState(true);

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

  const checkOpencodeStatus = useCallback(async () => {
    if (!opencodeEnabled) return;
    setOpencodeStatus("checking");
    try {
      const response = await fetch("/api/opencode/status", {
        cache: "no-store",
      });
      const data = await response.json();
      setOpencodeStatus(data.active ? "running" : "inactive");
    } catch {
      setOpencodeStatus("inactive");
    }
  }, [opencodeEnabled]);

  const handleEnableOpencode = () => {
    setShowOpencodeModal(true);
  };

  const handleConfirmOpencode = () => {
    setShowOpencodeModal(false);
    setOpencodeEnabled(true);
    setOpencodeStatus("active");
  };

  useEffect(() => {
    if (opencodeEnabled) {
      checkOpencodeStatus();
      const interval = setInterval(checkOpencodeStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [opencodeEnabled, checkOpencodeStatus]);

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

  const handleSaveGoogleApiKey = async () => {
    const trimmed = googleApiKey.trim();
    if (!trimmed) {
      toast.error("Enter a Google API key.");
      return;
    }

    setIsSavingKey(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          googleApiKey: trimmed,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to save Google API key.");
      }

      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
      setGoogleApiKey("");
      toast.success("Google API key saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save API key.",
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleClearGoogleApiKey = async () => {
    setIsSavingKey(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clearGoogleApiKey: true,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to clear Google API key.");
      }
      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
      setGoogleApiKey("");
      toast.success("Google API key removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to clear API key.",
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSaveOpenRouterApiKey = async () => {
    const trimmed = openRouterApiKey.trim();
    if (!trimmed) {
      toast.error("Enter an OpenRouter API key.");
      return;
    }

    setIsSavingKey(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          openRouterApiKey: trimmed,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to save OpenRouter API key.");
      }
      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
      setOpenRouterApiKey("");
      toast.success("OpenRouter API key saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save API key.",
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleClearOpenRouterApiKey = async () => {
    setIsSavingKey(true);
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clearOpenRouterApiKey: true,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to clear OpenRouter API key.");
      }
      const payload = parseSettingsResponse(await response.json());
      if (!payload) {
        throw new Error("Unexpected AI settings response.");
      }
      applySettings(payload);
      setOpenRouterApiKey("");
      toast.success("OpenRouter API key removed.");
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
    const opencodeModels = models.filter((model) => model.provider === "opencode");

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
                Key
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
                onManageKey: () => setShowGoogleConfig(true),
              })
            : null}

          {openRouterModels.length > 0
            ? renderProviderModelsSection({
                title: "OpenRouter models",
                modelsForProvider: openRouterModels,
                expanded: openRouterModelsExpanded,
                setExpanded: setOpenRouterModelsExpanded,
                onManageKey: () => setShowOpenRouterConfig(true),
              })
            : null}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (opencodeEnabled && opencodeStatus === "running") {
                  setOpencodeModelsExpanded(!opencodeModelsExpanded);
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && opencodeEnabled && opencodeStatus === "running") {
                  setOpencodeModelsExpanded(!opencodeModelsExpanded);
                }
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40 ${
                opencodeEnabled && opencodeStatus === "running" ? "cursor-pointer" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-muted p-1.5 text-muted-foreground">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground">OpenCode Zen</h4>
                  {opencodeEnabled ? (
                    <p className="text-xs text-muted-foreground">
                      {opencodeStatus === "running" ? "Running" : "Not running"}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!opencodeEnabled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnableOpencode();
                    }}
                  >
                    Enable
                  </Button>
                ) : null}
                {opencodeEnabled && opencodeStatus === "running" && (
                  <ChevronDownIcon
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      opencodeModelsExpanded ? "rotate-180" : ""
                    }`}
                  />
                )}
              </div>
            </div>

            {opencodeEnabled && opencodeStatus === "running" && opencodeModelsExpanded ? (
              <div className="space-y-2 border-t border-border p-3">
                {opencodeModels.length > 0 ? (
                  opencodeModels.map(renderModelRow)
                ) : (
                  <p className="text-xs text-muted-foreground">No OpenCode models found.</p>
                )}
              </div>
            ) : null}

            {opencodeEnabled && opencodeStatus !== "running" && (
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <Server className="h-4 w-4" />
                  <span>
                    Run{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                      opencode serve
                    </code>{" "}
                    in your terminal to activate.
                  </span>
                </div>
              </div>
            )}
          </div>
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

    return (
      <section
        id={tabPanelId("api-keys")}
        role="tabpanel"
        aria-labelledby={tabId("api-keys")}
        className="space-y-4"
      >
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Add your API keys and enable the models you want to use.
          </p>
        </div>

        <div className="space-y-4">
          {!hasGoogleApiKey || showGoogleConfig ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Google AI</h3>
                  <p className="text-sm text-muted-foreground">Paste your Google API key.</p>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <Input
                  type="password"
                  placeholder="Paste your Google API key (e.g., AIza...)"
                  value={googleApiKey}
                  onChange={(event) => setGoogleApiKey(event.target.value)}
                  disabled={isLoading || isSavingKey}
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveGoogleApiKey}
                    disabled={
                      isLoading || isSavingKey || googleApiKey.trim().length === 0
                    }
                  >
                    {isSavingKey
                      ? "Saving..."
                      : hasGoogleApiKey
                        ? "Update key"
                        : "Save key"}
                  </Button>
                  {hasGoogleApiKey && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowGoogleConfig(false);
                        setGoogleApiKey("");
                      }}
                      disabled={isLoading || isSavingKey}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Don&apos;t have an API key?{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Get one from Google AI Studio
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Google AI</h3>
                  <p className="text-sm text-muted-foreground">API key configured.</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGoogleConfig(true)}
                >
                  Change key
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearGoogleApiKey}
                  disabled={isLoading || isSavingKey}
                  className="text-destructive hover:text-destructive"
                >
                  Remove
                </Button>
              </div>
            </div>
          )}

          {!hasOpenRouterApiKey || showOpenRouterConfig ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">OpenRouter</h3>
                  <p className="text-sm text-muted-foreground">Paste your OpenRouter API key.</p>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <Input
                  type="password"
                  placeholder="Paste your OpenRouter API key (e.g., sk-or-v1-...)"
                  value={openRouterApiKey}
                  onChange={(event) => setOpenRouterApiKey(event.target.value)}
                  disabled={isLoading || isSavingKey}
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveOpenRouterApiKey}
                    disabled={
                      isLoading ||
                      isSavingKey ||
                      openRouterApiKey.trim().length === 0
                    }
                  >
                    {isSavingKey
                      ? "Saving..."
                      : hasOpenRouterApiKey
                        ? "Update key"
                        : "Save key"}
                  </Button>
                  {hasOpenRouterApiKey && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowOpenRouterConfig(false);
                        setOpenRouterApiKey("");
                      }}
                      disabled={isLoading || isSavingKey}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Don&apos;t have an API key?{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Get one from OpenRouter
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">OpenRouter</h3>
                  <p className="text-sm text-muted-foreground">API key configured.</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOpenRouterConfig(true)}
                >
                  Change key
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearOpenRouterApiKey}
                  disabled={isLoading || isSavingKey}
                  className="text-destructive hover:text-destructive"
                >
                  Remove
                </Button>
              </div>
            </div>
          )}
        </div>

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

        <Dialog open={showOpencodeModal} onOpenChange={setShowOpencodeModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-muted-foreground" />
                Enable OpenCode Zen
              </DialogTitle>
              <DialogDescription>
                OpenCode Zen adds local experimental models.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3 text-sm text-muted-foreground">
              Start it by running{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                opencode serve
              </code>{" "}
              in your terminal.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOpencodeModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmOpencode}>
                Enable OpenCode Zen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    );
  };

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
    </div>
  );
}
