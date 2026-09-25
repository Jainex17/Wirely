"use client";

import { useState } from "react";
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

const PROVIDER_ORDER = ["google", "openrouter", "zai"] as const;

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
  const [modelFilter, setModelFilter] = useState("");
  const normalizedModelFilter = modelFilter.trim().toLowerCase();
  // One machine reports hundreds of models; type to narrow, never render all.
  const matchesFilter = (label: string) =>
    !normalizedModelFilter || label.toLowerCase().includes(normalizedModelFilter);
  const showFilter = models.length > 12;

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
        {showFilter ? (
          <div className="p-2" onKeyDown={(event) => event.stopPropagation()}>
            <input
              value={modelFilter}
              onChange={(event) => setModelFilter(event.target.value)}
              placeholder="Search models…"
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ) : null}
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
        {PROVIDER_ORDER.map((provider, index) => {
          const providerModels = models
            .filter((model) => model.provider === provider)
            .filter((model) => matchesFilter(model.label))
            .slice(0, 60);
          if (providerModels.length === 0) return null;

          return (
            <DropdownMenuGroup key={provider}>
              {index > 0 || showConfigureApiKeysCta ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {WIRE_MODEL_PROVIDER_LABEL[provider]}
              </DropdownMenuLabel>
              {providerModels.map((model) => (
                <DropdownMenuItem key={model.id} onClick={() => onSelectModel(model.id)}>
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
        {models.length === 0 ? (
          <DropdownMenuItem disabled>No models enabled</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
