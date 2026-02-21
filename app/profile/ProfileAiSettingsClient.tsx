"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, KeyRound, PencilLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import type { WireModelName, WireModelTier } from "@/lib/wireModels";

interface AiSettingsModel {
  id: WireModelName;
  label: string;
  tier: WireModelTier;
  enabled: boolean;
}

interface AiSettingsResponse {
  hasGoogleApiKey: boolean;
  enabledModelIds: WireModelName[];
  models: AiSettingsModel[];
}

interface ProfileAiSettingsClientProps {
  userName: string | null;
  userEmail: string | null;
}

type ProfileSettingsTab = "details" | "api-keys" | "models";

const PROFILE_SETTINGS_TABS: Array<{
  id: ProfileSettingsTab;
  label: string;
}> = [
  { id: "details", label: "Details" },
  { id: "api-keys", label: "API keys" },
  { id: "models", label: "Models" },
];

const tabPanelId = (tabId: ProfileSettingsTab) => `profile-tabpanel-${tabId}`;
const tabId = (tabIdValue: ProfileSettingsTab) => `profile-tab-${tabIdValue}`;

const parseSettingsResponse = (value: unknown): AiSettingsResponse | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.hasGoogleApiKey !== "boolean" ||
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
      ((model as AiSettingsModel).tier === "free" ||
        (model as AiSettingsModel).tier === "paid") &&
      typeof (model as AiSettingsModel).enabled === "boolean",
  );

  return {
    hasGoogleApiKey: record.hasGoogleApiKey,
    enabledModelIds: record.enabledModelIds as WireModelName[],
    models,
  };
};

export default function ProfileAiSettingsClient({
  userName,
  userEmail,
}: ProfileAiSettingsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileSettingsTab>("details");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [hasGoogleApiKey, setHasGoogleApiKey] = useState(false);
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [displayName, setDisplayName] = useState(userName ?? "");
  const [savedDisplayName, setSavedDisplayName] = useState(userName ?? "");
  const [models, setModels] = useState<AiSettingsModel[]>([]);

  const freeModels = useMemo(
    () => models.filter((model) => model.tier === "free"),
    [models],
  );
  const paidModels = useMemo(
    () => models.filter((model) => model.tier === "paid"),
    [models],
  );
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

  const renderApiKeysTab = () => (
    <section
      id={tabPanelId("api-keys")}
      role="tabpanel"
      aria-labelledby={tabId("api-keys")}
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Google AI key
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure your personal key used for generation.
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            hasGoogleApiKey
              ? "bg-secondary text-secondary-foreground"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {hasGoogleApiKey ? "Configured" : "Not configured"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        <Input
          type="password"
          placeholder="Paste Google API key"
          value={googleApiKey}
          onChange={(event) => setGoogleApiKey(event.target.value)}
          disabled={isLoading || isSavingKey}
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
          <Button
            type="button"
            variant="outline"
            onClick={handleClearGoogleApiKey}
            disabled={isLoading || isSavingKey || !hasGoogleApiKey}
          >
            Clear key
          </Button>
        </div>
      </div>
    </section>
  );

  const renderModelsTab = () => (
    <section
      id={tabPanelId("models")}
      role="tabpanel"
      aria-labelledby={tabId("models")}
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Enabled models
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enabled models appear in home and sidebar dropdowns.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Free models
          </p>
          <div className="mt-2 space-y-1.5">
            {freeModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm text-foreground">{model.label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant={model.enabled ? "default" : "outline"}
                  onClick={() => toggleModel(model.id)}
                  disabled={isLoading || isSavingModels}
                >
                  {model.enabled ? "Enabled" : "Enable"}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Paid models
          </p>
          <div className="mt-2 space-y-1.5">
            {paidModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm text-foreground">{model.label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant={model.enabled ? "default" : "outline"}
                  onClick={() => toggleModel(model.id)}
                  disabled={isLoading || isSavingModels}
                >
                  {model.enabled ? "Enabled" : "Enable"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {enabledModelIds.length === 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          No models are enabled. Enable at least one model to generate pages.
        </p>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        Only Google models are configurable in this release.
      </p>
    </section>
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

      {activeTab === "details" ? renderDetailsTab() : null}
      {activeTab === "api-keys" ? renderApiKeysTab() : null}
      {activeTab === "models" ? renderModelsTab() : null}
    </div>
  );
}
