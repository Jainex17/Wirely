"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import GeminiIcon from "@/components/icons/GeminiIcon";
import ProfileApiKeyDialog from "./ProfileApiKeyDialog";
import {
  type ApiKeyProvider,
  useProfileAiSettings,
} from "./useProfileAiSettings";

const PROVIDER_META = {
  google: {
    label: "Google AI",
    description: "Use your Google AI Studio key.",
    learnMoreUrl: "https://aistudio.google.com/app/apikey",
    supportsModelToggle: true,
  },
  openrouter: {
    label: "OpenRouter",
    description: "Use your OpenRouter key.",
    learnMoreUrl: "https://openrouter.ai/keys",
    supportsModelToggle: true,
  },
  zai: {
    label: "Z.ai",
    description: "Use your Z.ai key for GLM models.",
    learnMoreUrl: "https://docs.z.ai/guides/overview/quick-start",
    supportsModelToggle: true,
  },
  unsplash: {
    label: "Unsplash",
    description: "Enter your Unsplash Access Key to enable stock photos.",
    learnMoreUrl: "https://unsplash.com/documentation",
    supportsModelToggle: false,
  },
} as const;

export default function ProfileProvidersClient() {
  const [activeProvider, setActiveProvider] = useState<ApiKeyProvider | null>(null);
  const {
    isLoading,
    isSavingKey,
    isSavingModels,
    hasGoogleApiKey,
    hasOpenRouterApiKey,
    hasZaiApiKey,
    hasUnsplashApiKey,
    models,
    saveApiKey,
    clearApiKey,
    setProviderEnabled,
  } = useProfileAiSettings();

  const providerCards = useMemo(
    () => [
      {
        id: "google" as const,
        ...PROVIDER_META.google,
        hasKey: hasGoogleApiKey,
        enabledCount: models.filter(
          (model) => model.provider === "google" && model.enabled,
        ).length,
        totalCount: models.filter((model) => model.provider === "google").length,
      },
      {
        id: "openrouter" as const,
        ...PROVIDER_META.openrouter,
        hasKey: hasOpenRouterApiKey,
        enabledCount: models.filter(
          (model) => model.provider === "openrouter" && model.enabled,
        ).length,
        totalCount: models.filter((model) => model.provider === "openrouter").length,
      },
      {
        id: "zai" as const,
        ...PROVIDER_META.zai,
        hasKey: hasZaiApiKey,
        enabledCount: models.filter((model) => model.provider === "zai" && model.enabled)
          .length,
        totalCount: models.filter((model) => model.provider === "zai").length,
      },
      {
        id: "unsplash" as const,
        ...PROVIDER_META.unsplash,
        hasKey: hasUnsplashApiKey,
        enabledCount: 0,
        totalCount: 0,
      },
    ],
    [hasGoogleApiKey, hasOpenRouterApiKey, hasZaiApiKey, hasUnsplashApiKey, models],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="gap-0 rounded-xl p-4 shadow-none">
            <CardContent className="p-0">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-56 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {providerCards.map((provider) => {
          const isProviderEnabled =
            provider.totalCount > 0 && provider.enabledCount === provider.totalCount;

          return (
            <Card key={provider.id} className="gap-0 rounded-xl p-4 shadow-none">
              <CardContent className="p-0">
                <div className="flex items-start gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
                    {provider.id === "google" ? (
                      <GeminiIcon className="size-5 text-primary" />
                    ) : (
                      <KeyRound className="size-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <div>
                          <CardTitle className="text-sm font-semibold">
                            {provider.label}
                          </CardTitle>
                          <CardDescription className="mt-0.5 text-xs">
                            {provider.description}
                          </CardDescription>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          provider.hasKey
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {provider.hasKey ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {provider.hasKey ? "Configured" : "Missing key"}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {provider.supportsModelToggle ? (
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isProviderEnabled}
                            aria-label={`${isProviderEnabled ? "Disable" : "Enable"} ${provider.label}`}
                            onClick={() =>
                              setProviderEnabled(provider.id, !isProviderEnabled)
                            }
                            disabled={isSavingModels}
                            className={`relative inline-flex h-[1.15rem] w-8 shrink-0 rounded-full border border-transparent shadow-xs transition-all outline-none ${
                              isProviderEnabled ? "bg-primary" : "bg-input"
                            } ${isSavingModels ? "cursor-not-allowed opacity-60" : ""}`}
                          >
                            <span
                              className={`block size-4 rounded-full bg-background transition-transform ${
                                isProviderEnabled
                                  ? "translate-x-[calc(100%-2px)]"
                                  : "translate-x-0"
                              }`}
                            />
                          </button>
                          <span className="text-sm font-medium text-foreground">
                            {provider.label}
                          </span>
                        </div>
                      ) : null}

                      {isProviderEnabled || !provider.supportsModelToggle ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => setActiveProvider(provider.id)}
                            variant="outline"
                            size="sm"
                            disabled={isSavingModels}
                          >
                            <Settings2 className="size-4" />
                            {provider.id === "unsplash"
                              ? provider.hasKey
                                ? "Manage access key"
                                : "Enter access key"
                              : provider.hasKey
                                ? "Manage BYOK"
                                : "Setup BYOK"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {isSavingKey ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving provider changes...
        </div>
      ) : null}

      {isSavingModels ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating provider models...
        </div>
      ) : null}

      <ProfileApiKeyDialog
        provider={activeProvider}
        hasKey={
          activeProvider === "google"
            ? hasGoogleApiKey
            : activeProvider === "openrouter"
              ? hasOpenRouterApiKey
              : activeProvider === "zai"
                ? hasZaiApiKey
              : activeProvider === "unsplash"
                ? hasUnsplashApiKey
                : false
        }
        isSaving={isSavingKey}
        onClose={() => setActiveProvider(null)}
        onSave={saveApiKey}
        onClear={clearApiKey}
      />
    </div>
  );
}
