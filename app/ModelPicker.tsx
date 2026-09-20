"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import GeminiIcon from "@/components/icons/GeminiIcon";
import {
  WIRE_MODEL_PROVIDER_LABEL,
  type WireModelName,
  type WireModelOption,
} from "@/lib/wireModels";

// opencode first: it is free and needs no key, so it is the easiest to run.
const PROVIDER_ORDER = ["opencode", "google", "openrouter", "zai"] as const;

interface ModelPickerProps {
  label: string;
  disabled: boolean;
  showApiKeyWarning: boolean;
  showConfigureApiKeysCta: boolean;
  models: WireModelOption[];
  onSelectModel: (modelId: WireModelName) => void;
  onOpenProviders: () => void;
}

export default function ModelPicker({
  label,
  disabled,
  showApiKeyWarning,
  showConfigureApiKeysCta,
  models,
  onSelectModel,
  onOpenProviders,
}: ModelPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground"
        >
          <GeminiIcon className="size-4 text-primary" />
          {label}
          {showApiKeyWarning ? (
            <AlertTriangle size={14} className="text-destructive" />
          ) : null}
          <ChevronDown size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[36rem] max-w-[calc(100vw-2rem)]"
      >
        {showConfigureApiKeysCta ? (
          <>
            <DropdownMenuItem
              onClick={onOpenProviders}
              className="text-destructive focus:text-destructive"
            >
              <AlertTriangle size={14} />
              Connect a provider key first
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-x-2">
          {PROVIDER_ORDER.map((provider) => {
            const providerModels = models.filter((model) => model.provider === provider);
            if (providerModels.length === 0) return null;

            return (
              <DropdownMenuGroup key={provider} className="min-w-0">
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {WIRE_MODEL_PROVIDER_LABEL[provider]}
                </DropdownMenuLabel>
                {providerModels.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => onSelectModel(model.id)}
                  >
                    <span className="truncate">{model.label}</span>
                    {model.tier === "paid" ? (
                      <span className="ml-auto shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        Billed
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            );
          })}
        </div>
        {models.length === 0 ? (
          <DropdownMenuItem disabled>No models enabled</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
