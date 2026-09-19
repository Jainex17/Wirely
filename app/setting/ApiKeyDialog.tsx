"use client";

import { useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

export type ApiKeyProvider = "google" | "openrouter" | "zai" | "unsplash";

export const PROVIDERS: Record<
  ApiKeyProvider,
  {
    label: string;
    summary: string;
    keyLabel: string;
    placeholder: string;
    keyUrl: string;
    unlocks: string;
  }
> = {
  google: {
    label: "Google AI Studio",
    summary: "Gemini models straight from Google, on your own quota.",
    keyLabel: "API key",
    placeholder: "AIza...",
    keyUrl: "https://aistudio.google.com/app/apikey",
    unlocks: "Gemini Flash and Pro",
  },
  openrouter: {
    label: "OpenRouter",
    summary: "One key, many vendors. Useful when a model is rate limited.",
    keyLabel: "API key",
    placeholder: "sk-or-v1-...",
    keyUrl: "https://openrouter.ai/keys",
    unlocks: "Gemini, GLM, Nemotron",
  },
  zai: {
    label: "Z.ai",
    summary: "Direct access to the GLM family.",
    keyLabel: "API key",
    placeholder: "Paste your Z.ai key",
    keyUrl: "https://docs.z.ai/guides/overview/quick-start",
    unlocks: "GLM Flash models",
  },
  unsplash: {
    label: "Unsplash",
    summary: "Real photography inside generated pages instead of grey boxes.",
    keyLabel: "Access key",
    placeholder: "Paste your Unsplash access key",
    keyUrl: "https://unsplash.com/documentation",
    unlocks: "Stock photos in generations",
  },
};

interface ApiKeyDialogProps {
  provider: ApiKeyProvider | null;
  hasKey: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (provider: ApiKeyProvider, apiKey: string) => Promise<boolean>;
  onClear: (provider: ApiKeyProvider) => Promise<boolean>;
}

export default function ApiKeyDialog({ provider, ...rest }: ApiKeyDialogProps) {
  if (!provider) return null;
  return <ApiKeyDialogBody key={provider} provider={provider} {...rest} />;
}

function ApiKeyDialogBody({
  provider,
  hasKey,
  isSaving,
  onClose,
  onSave,
  onClear,
}: Omit<ApiKeyDialogProps, "provider"> & { provider: ApiKeyProvider }) {
  const [apiKey, setApiKey] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const meta = PROVIDERS[provider];
  const lowerKeyLabel = meta.keyLabel.toLowerCase();

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      toast.error(`Enter a ${meta.label} ${lowerKeyLabel}.`);
      return;
    }
    if (await onSave(provider, trimmed)) onClose();
  };

  const handleClear = async () => {
    if (await onClear(provider)) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="rounded-xl sm:max-w-lg" showCloseButton={!isSaving}>
        <DialogHeader>
          <DialogTitle>{meta.label}</DialogTitle>
          <DialogDescription>{meta.summary}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="provider-api-key">{meta.keyLabel}</Label>
          <div className="relative">
            <Input
              id="provider-api-key"
              type={isRevealed ? "text" : "password"}
              placeholder={meta.placeholder}
              value={apiKey}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setApiKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && apiKey.trim() && !isSaving) {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              disabled={isSaving}
              className="h-11 pr-11 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setIsRevealed((value) => !value)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={isRevealed ? `Hide ${lowerKeyLabel}` : `Show ${lowerKeyLabel}`}
            >
              {isRevealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Stored encrypted on Wirely servers and never sent to the browser again.{" "}
            <a
              href={meta.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Get a key
              <ExternalLink className="size-3" />
            </a>
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {hasKey ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              disabled={isSaving}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Remove key
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving || !apiKey.trim()}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              {hasKey ? "Update key" : "Save key"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
