"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";
import type {
  WireModelName,
  WireModelProvider,
  WireModelTier,
} from "@/lib/wireModels";

export interface AiSettingsModel {
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
  hasUnsplashApiKey: boolean;
  enabledModelIds: WireModelName[];
  models: AiSettingsModel[];
}

export type ApiKeyProvider = "google" | "openrouter" | "unsplash";

const parseSettingsResponse = (value: unknown): AiSettingsResponse | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  if (
    typeof record.hasGoogleApiKey !== "boolean" ||
    typeof record.hasOpenRouterApiKey !== "boolean" ||
    typeof record.hasUnsplashApiKey !== "boolean" ||
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
    hasUnsplashApiKey: record.hasUnsplashApiKey,
    enabledModelIds: record.enabledModelIds as WireModelName[],
    models,
  };
};

export function useProfileAiSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [hasGoogleApiKey, setHasGoogleApiKey] = useState(false);
  const [hasOpenRouterApiKey, setHasOpenRouterApiKey] = useState(false);
  const [hasUnsplashApiKey, setHasUnsplashApiKey] = useState(false);
  const [models, setModels] = useState<AiSettingsModel[]>([]);

  const enabledModelIds = useMemo(
    () => models.filter((model) => model.enabled).map((model) => model.id),
    [models],
  );

  const applySettings = useCallback((payload: AiSettingsResponse) => {
    setHasGoogleApiKey(payload.hasGoogleApiKey);
    setHasOpenRouterApiKey(payload.hasOpenRouterApiKey);
    setHasUnsplashApiKey(payload.hasUnsplashApiKey);
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

  const saveApiKey = useCallback(
    async (provider: ApiKeyProvider, apiKey: string) => {
      setIsSavingKey(true);
      try {
        const response = await fetch("/api/profile/ai-settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            provider === "google"
              ? { googleApiKey: apiKey }
              : provider === "openrouter"
                ? { openRouterApiKey: apiKey }
                : { unsplashApiKey: apiKey },
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
        toast.success(
          provider === "google"
            ? "Google API key saved."
            : provider === "openrouter"
              ? "OpenRouter API key saved."
              : "Unsplash API key saved.",
        );

        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save API key.",
        );
        return false;
      } finally {
        setIsSavingKey(false);
      }
    },
    [applySettings],
  );

  const clearApiKey = useCallback(
    async (provider: ApiKeyProvider) => {
      setIsSavingKey(true);
      try {
        const response = await fetch("/api/profile/ai-settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            provider === "google"
              ? { clearGoogleApiKey: true }
              : provider === "openrouter"
                ? { clearOpenRouterApiKey: true }
                : { clearUnsplashApiKey: true },
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
        toast.success(
          provider === "google"
            ? "Google API key removed."
            : provider === "openrouter"
              ? "OpenRouter API key removed."
              : "Unsplash API key removed.",
        );

        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to clear API key.",
        );
        return false;
      } finally {
        setIsSavingKey(false);
      }
    },
    [applySettings],
  );

  const persistEnabledModels = useCallback(
    async (nextEnabledModelIds: WireModelName[]) => {
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
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update models.",
        );
        return false;
      } finally {
        setIsSavingModels(false);
      }
    },
    [applySettings],
  );

  const toggleModel = useCallback(
    (modelId: WireModelName) => {
      const nextEnabledModelIds = models
        .map((model) =>
          model.id === modelId ? { ...model, enabled: !model.enabled } : model,
        )
        .filter((model) => model.enabled)
        .map((model) => model.id);

      void persistEnabledModels(nextEnabledModelIds);
    },
    [models, persistEnabledModels],
  );

  const setProviderEnabled = useCallback(
    (provider: WireModelProvider, enabled: boolean) => {
      const providerModelIds = models
        .filter((model) => model.provider === provider)
        .map((model) => model.id);

      const nextEnabledModelIds = enabled
        ? Array.from(new Set([...enabledModelIds, ...providerModelIds]))
        : enabledModelIds.filter((modelId) => !providerModelIds.includes(modelId));

      void persistEnabledModels(nextEnabledModelIds);
    },
    [enabledModelIds, models, persistEnabledModels],
  );

  return {
    isLoading,
    isSavingKey,
    isSavingModels,
    hasGoogleApiKey,
    hasOpenRouterApiKey,
    hasUnsplashApiKey,
    models,
    enabledModelIds,
    loadSettings,
    saveApiKey,
    clearApiKey,
    toggleModel,
    setProviderEnabled,
  };
}
