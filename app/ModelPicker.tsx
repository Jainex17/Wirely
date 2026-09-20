"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
  // One group open at a time, all closed on open, so the menu starts short.
  const [openProvider, setOpenProvider] = useState<string | null>(null);

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
      <DropdownMenuContent align="start" className="w-72">
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
        {PROVIDER_ORDER.map((provider) => {
          const providerModels = models.filter((model) => model.provider === provider);
          if (providerModels.length === 0) return null;
          const open = openProvider === provider;

          return (
            <DropdownMenuGroup key={provider}>
              <DropdownMenuItem
                // Keeping the menu open is the whole point: this row expands a
                // group rather than choosing a model.
                onSelect={(event) => event.preventDefault()}
                onClick={() => setOpenProvider(open ? null : provider)}
                className="text-muted-foreground"
              >
                {open ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <span className="truncate">{WIRE_MODEL_PROVIDER_LABEL[provider]}</span>
                <span className="ml-auto font-mono text-[10px]">
                  {providerModels.length}
                </span>
              </DropdownMenuItem>

              {open
                ? providerModels.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onClick={() => onSelectModel(model.id)}
                      className="pl-8"
                    >
                      <span className="truncate">{model.label}</span>
                      {model.tier === "paid" ? (
                        <span className="ml-auto shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          Billed
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  ))
                : null}
            </DropdownMenuGroup>
          );
        })}
        {models.length === 0 ? (
          <DropdownMenuItem disabled>No models enabled</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
