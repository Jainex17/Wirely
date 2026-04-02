"use client";

import { useState } from "react";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
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
import type { ApiKeyProvider } from "./useProfileAiSettings";

interface ProfileApiKeyDialogProps {
  provider: ApiKeyProvider | null;
  hasKey: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (provider: ApiKeyProvider, apiKey: string) => Promise<boolean>;
  onClear: (provider: ApiKeyProvider) => Promise<boolean>;
}

const getProviderLabel = (provider: ApiKeyProvider) =>
  provider === "google"
    ? "Google"
    : provider === "openrouter"
      ? "OpenRouter"
      : provider === "zai"
        ? "Z.ai"
      : "Unsplash";

const getProviderKeyLabel = (provider: ApiKeyProvider) =>
  provider === "unsplash" ? "Access Key" : "API key";

const getProviderPlaceholder = (provider: ApiKeyProvider) =>
  provider === "google"
    ? "Paste your Google API key (e.g., AIza...)"
    : provider === "openrouter"
      ? "Paste your OpenRouter API key (e.g., sk-or-v1-...)"
      : provider === "zai"
        ? "Paste your Z.ai API key"
      : "Paste your Unsplash Access Key";

const getProviderLearnMoreUrl = (provider: ApiKeyProvider) =>
  provider === "google"
    ? "https://aistudio.google.com/app/apikey"
    : provider === "openrouter"
      ? "https://openrouter.ai/keys"
      : provider === "zai"
        ? "https://docs.z.ai/guides/overview/quick-start"
      : "https://unsplash.com/documentation";

export default function ProfileApiKeyDialog({
  provider,
  hasKey,
  isSaving,
  onClose,
  onSave,
  onClear,
}: ProfileApiKeyDialogProps) {
  if (!provider) return null;

  return (
    <ProfileApiKeyDialogBody
      key={provider}
      provider={provider}
      hasKey={hasKey}
      isSaving={isSaving}
      onClose={onClose}
      onSave={onSave}
      onClear={onClear}
    />
  );
}

function ProfileApiKeyDialogBody({
  provider,
  hasKey,
  isSaving,
  onClose,
  onSave,
  onClear,
}: Omit<ProfileApiKeyDialogProps, "provider"> & {
  provider: ApiKeyProvider;
}) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKeyValue, setShowApiKeyValue] = useState(false);

  const providerLabel = getProviderLabel(provider);
  const providerKeyLabel = getProviderKeyLabel(provider);
  const providerPlaceholder = getProviderPlaceholder(provider);
  const providerLearnMoreUrl = getProviderLearnMoreUrl(provider);

  const handleSave = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      toast.error(
        provider === "google"
          ? "Enter a Google API key."
          : provider === "openrouter"
            ? "Enter an OpenRouter API key."
            : provider === "zai"
              ? "Enter a Z.ai API key."
            : "Enter an Unsplash Access Key.",
      );
      return;
    }

    const didSave = await onSave(provider, trimmed);
    if (didSave) {
      onClose();
    }
  };

  const handleClear = async () => {
    const didClear = await onClear(provider);
    if (didClear) {
      onClose();
    }
  };

  return (
    <Dialog
      open={provider !== null}
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          onClose();
        }
      }}
    >
      <DialogContent className="shadow-xl" showCloseButton={!isSaving}>
        <DialogHeader>
          <DialogTitle>
            {providerLabel} {providerKeyLabel}
          </DialogTitle>
          <DialogDescription>
            Add or update your {providerLabel} {providerKeyLabel.toLowerCase()} here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Input
              type={showApiKeyValue ? "text" : "password"}
              placeholder={providerPlaceholder}
              value={apiKeyInput}
              autoFocus
              onChange={(event) => setApiKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && apiKeyInput.trim().length > 0 && !isSaving) {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              disabled={isSaving}
              className="pr-11 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowApiKeyValue((previousValue) => !previousValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={showApiKeyValue ? "Hide API key" : "Show API key"}
            >
              {showApiKeyValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Press Enter to save quickly.</p>
            <p className="text-xs text-muted-foreground">
              Don&apos;t have a {providerKeyLabel.toLowerCase()}?{" "}
              <a
                href={providerLearnMoreUrl}
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
            {hasKey ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleClear}
                disabled={isSaving}
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
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || apiKeyInput.trim().length === 0}
            >
              {isSaving ? "Saving..." : hasKey ? "Update key" : "Save key"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
