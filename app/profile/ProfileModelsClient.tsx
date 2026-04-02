"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { WireModelProvider } from "@/lib/wireModels";
import { useProfileAiSettings } from "./useProfileAiSettings";

const PROVIDER_LABEL: Record<WireModelProvider, string> = {
  google: "Google BYOK",
  openrouter: "OpenRouter BYOK",
  zai: "Z.ai BYOK",
};

export default function ProfileModelsClient() {
  const { isLoading, isSavingModels, models } = useProfileAiSettings();

  const activeModels = models.filter((model) => model.enabled);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="gap-0 rounded-xl py-0 shadow-none">
            <CardHeader className="px-4 py-4">
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-3 flex gap-2">
                <div className="h-7 w-28 animate-pulse rounded-md bg-muted" />
                <div className="h-7 w-20 animate-pulse rounded-md bg-muted" />
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-3xl font-semibold tracking-tight text-foreground">
          Available Models
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Models available from your configured providers
        </p>
      </div>

      {isSavingModels ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating models...
        </div>
      ) : null}

      {activeModels.length === 0 ? (
        <Card className="gap-0 rounded-xl px-4 py-3 shadow-none">
          <CardContent className="p-0 text-sm text-muted-foreground">
            No models available.
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {activeModels.map((model) => (
          <Card key={model.id} className="gap-0 rounded-xl px-4 py-3 shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold text-foreground sm:text-base">
                    {model.label}
                  </h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      {model.provider === "openrouter"
                        ? "Multi-model access"
                        : model.provider === "zai"
                          ? "GLM access"
                        : "Gemini access"}
                    </span>
                  </div>
                </div>
                <div className="text-sm font-medium text-muted-foreground sm:pl-6">
                  {PROVIDER_LABEL[model.provider]}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
