"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import GeminiIcon from "@/components/icons/GeminiIcon";
import { toast } from "@/components/ui/sonner";
import {
  WIRE_MODEL_OPTIONS,
  type WireModelName,
  type WireModelProvider,
} from "@/lib/wireModels";
import ApiKeyDialog, {
  PROVIDERS,
  type ApiKeyProvider,
} from "./ApiKeyDialog";
import LocalAgentPanel, { type AgentTokenSummary } from "./LocalAgentPanel";

export type SettingsTab = "account" | "providers" | "models" | "agent";
export type ProviderKeys = Record<ApiKeyProvider, boolean>;

interface SettingsClientProps {
  user: { name: string | null; email: string | null; avatarUrl: string | null };
  initialKeys: ProviderKeys;
  initialEnabledModelIds: WireModelName[];
  initialTab: SettingsTab;
  initialAgentTokens: AgentTokenSummary[];
  initialAgentOnline: boolean;
}

const MODEL_PROVIDERS: WireModelProvider[] = ["opencode", "google", "openrouter", "zai"];

/**
 * opencode models run on the user's own machine, so they have no API key and no
 * entry in PROVIDERS. Their credential is a connected local agent instead.
 */
const OPENCODE_PROVIDER = {
  label: "opencode (local)",
  summary: "Free models through the agent on your machine.",
} as const;

const providerLabel = (provider: WireModelProvider) =>
  provider === "opencode" ? OPENCODE_PROVIDER.label : PROVIDERS[provider].label;

const KEY_FIELD: Record<ApiKeyProvider, string> = {
  google: "googleApiKey",
  openrouter: "openRouterApiKey",
  zai: "zaiApiKey",
  unsplash: "unsplashApiKey",
};

const CLEAR_FIELD: Record<ApiKeyProvider, string> = {
  google: "clearGoogleApiKey",
  openrouter: "clearOpenRouterApiKey",
  zai: "clearZaiApiKey",
  unsplash: "clearUnsplashApiKey",
};

interface SettingsSnapshot {
  keys: ProviderKeys;
  enabledModelIds: WireModelName[];
}

const readSnapshot = (value: unknown): SettingsSnapshot | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.enabledModelIds)) return null;

  return {
    keys: {
      google: record.hasGoogleApiKey === true,
      openrouter: record.hasOpenRouterApiKey === true,
      zai: record.hasZaiApiKey === true,
      unsplash: record.hasUnsplashApiKey === true,
    },
    enabledModelIds: record.enabledModelIds as WireModelName[],
  };
};

export default function SettingsClient({
  user,
  initialKeys,
  initialEnabledModelIds,
  initialTab,
  initialAgentTokens,
  initialAgentOnline,
}: SettingsClientProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [keys, setKeys] = useState(initialKeys);
  const [enabledModelIds, setEnabledModelIds] = useState(initialEnabledModelIds);
  const [dialogProvider, setDialogProvider] = useState<ApiKeyProvider | null>(null);
  const [isSavingKey, setIsSavingKey] = useState(false);

  const patchSettings = async (body: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/profile/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error?: unknown }).error)
            : "Could not save that change.";
        throw new Error(message);
      }

      const snapshot = readSnapshot(payload);
      if (!snapshot) throw new Error("Unexpected response from the server.");

      setKeys(snapshot.keys);
      setEnabledModelIds(snapshot.enabledModelIds);
      return snapshot;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that change.");
      return null;
    }
  };

  const saveApiKey = async (provider: ApiKeyProvider, apiKey: string) => {
    setIsSavingKey(true);
    const snapshot = await patchSettings({ [KEY_FIELD[provider]]: apiKey });
    setIsSavingKey(false);
    if (snapshot) toast.success(`${PROVIDERS[provider].label} key saved.`);
    return Boolean(snapshot);
  };

  const clearApiKey = async (provider: ApiKeyProvider) => {
    setIsSavingKey(true);
    const snapshot = await patchSettings({ [CLEAR_FIELD[provider]]: true });
    setIsSavingKey(false);
    if (snapshot) toast.success(`${PROVIDERS[provider].label} key removed.`);
    return Boolean(snapshot);
  };

  // Last write wins if two switches are flipped inside one round trip.
  const writeEnabledModels = async (nextIds: WireModelName[]) => {
    const previousIds = enabledModelIds;
    setEnabledModelIds(nextIds);
    const snapshot = await patchSettings({ enabledModelIds: nextIds });
    if (!snapshot) setEnabledModelIds(previousIds);
  };

  const toggleModel = (modelId: WireModelName) =>
    void writeEnabledModels(
      enabledModelIds.includes(modelId)
        ? enabledModelIds.filter((id) => id !== modelId)
        : [...enabledModelIds, modelId],
    );

  const setProviderModels = (provider: WireModelProvider, enabled: boolean) => {
    const providerIds = WIRE_MODEL_OPTIONS.filter(
      (model) => model.provider === provider,
    ).map((model) => model.id);

    void writeEnabledModels(
      enabled
        ? Array.from(new Set([...enabledModelIds, ...providerIds]))
        : enabledModelIds.filter((id) => !providerIds.includes(id)),
    );
  };

  const connectedKeyCount = Object.values(keys).filter(Boolean).length;

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <AppHeader user={user} title="Settings" showBackButton />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6">
        <header className="pb-7 pt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Settings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Your account, the provider keys Wirely generates with, and the models
            allowed to run.
          </p>
        </header>

        <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
          <TabsList
            variant="line"
            className="w-full justify-start gap-6 border-b border-border/60 p-0"
          >
            <SettingsTabTrigger value="account" label="Account" />
            <SettingsTabTrigger
              value="providers"
              label="Providers"
              meta={`${connectedKeyCount}/4`}
            />
            <SettingsTabTrigger
              value="models"
              label="Models"
              meta={`${enabledModelIds.length}/${WIRE_MODEL_OPTIONS.length}`}
            />
            <SettingsTabTrigger
              value="agent"
              label="Local agent"
              meta={initialAgentOnline ? "on" : undefined}
            />
          </TabsList>

          <TabsContent value="account" className="pt-10">
            <AccountPanel user={user} />
          </TabsContent>

          <TabsContent value="providers" className="pt-10">
            <ProvidersPanel keys={keys} onManage={setDialogProvider} />
          </TabsContent>

          <TabsContent value="models" className="pt-10">
            <ModelsPanel
              keys={keys}
              enabledModelIds={enabledModelIds}
              agentOnline={initialAgentOnline}
              onToggleModel={toggleModel}
              onToggleProvider={setProviderModels}
              onAddKey={setDialogProvider}
              onOpenAgentTab={() => setTab("agent")}
            />
          </TabsContent>

          <TabsContent value="agent" className="pt-10">
            <LocalAgentPanel
              initialTokens={initialAgentTokens}
              initialOnline={initialAgentOnline}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ApiKeyDialog
        provider={dialogProvider}
        hasKey={dialogProvider ? keys[dialogProvider] : false}
        isSaving={isSavingKey}
        onClose={() => setDialogProvider(null)}
        onSave={saveApiKey}
        onClear={clearApiKey}
      />
    </div>
  );
}

function SettingsTabTrigger({
  value,
  label,
  meta,
}: {
  value: SettingsTab;
  label: string;
  meta?: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex-none px-0 pb-3 text-[15px] data-[state=active]:after:bg-primary data-[state=active]:after:opacity-100"
    >
      {label}
      {meta ? (
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{meta}</span>
      ) : null}
    </TabsTrigger>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-12">
      <div className="md:pt-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function AccountPanel({
  user,
}: {
  user: SettingsClientProps["user"];
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const savedName = user.name ?? "";
  const initials =
    (savedName || user.email || "W")
      .split(/[\s@.]+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "W";

  const save = async () => {
    if (isSaving || name.trim() === savedName.trim()) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/profile/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as { error?: string; name?: string | null };
      if (!response.ok) throw new Error(payload.error || "Could not save your name.");

      setName((payload.name ?? "").trim());
      setIsEditing(false);
      toast.success("Name updated.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your name.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel
      title="Profile"
      description="How you show up in Wirely. Sign-in stays with Google."
    >
      <div className="rounded-xl border border-border/70 bg-card">
        <div className="flex items-center gap-4 border-b border-border/60 px-5 py-5">
          <Avatar size="lg" className="size-14 rounded-xl">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt="" className="rounded-xl" />
            ) : null}
            <AvatarFallback className="rounded-xl bg-secondary text-base font-semibold text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-foreground">
              {savedName || "Unnamed builder"}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email ?? "No email on file"}
            </p>
          </div>
        </div>

        <div className="px-5 py-5">
          {isEditing ? (
            <div className="space-y-2">
              <Label htmlFor="display-name">Display name</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="display-name"
                  value={name}
                  autoFocus
                  placeholder="Your name"
                  disabled={isSaving}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void save();
                    }
                    if (event.key === "Escape") {
                      setName(savedName);
                      setIsEditing(false);
                    }
                  }}
                  className="sm:max-w-xs"
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={() => void save()} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSaving}
                    onClick={() => {
                      setName(savedName);
                      setIsEditing(false);
                    }}
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Display name</p>
                <p className="mt-1 truncate text-sm text-foreground">
                  {savedName || "Not set"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ProvidersPanel({
  keys,
  onManage,
}: {
  keys: ProviderKeys;
  onManage: (provider: ApiKeyProvider) => void;
}) {
  const providerIds = Object.keys(PROVIDERS) as ApiKeyProvider[];

  return (
    <Panel
      title="Provider keys"
      description="Wirely runs on your keys. Nothing is generated until at least one is connected."
    >
      <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
        {providerIds.map((providerId) => {
          const provider = PROVIDERS[providerId];
          const connected = keys[providerId];

          return (
            <div
              key={providerId}
              className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3.5">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground"
                >
                  {providerId === "google" ? (
                    <GeminiIcon className="size-4" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{provider.label}</p>
                    {connected ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        <Check className="size-3" />
                        Connected
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {provider.summary}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    {provider.unlocks}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant={connected ? "outline" : "default"}
                size="sm"
                className="shrink-0 self-start sm:self-center"
                onClick={() => onManage(providerId)}
              >
                {connected ? (
                  "Manage"
                ) : (
                  <>
                    <Plus className="size-3.5" />
                    Add key
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ModelsPanel({
  keys,
  enabledModelIds,
  agentOnline,
  onToggleModel,
  onToggleProvider,
  onAddKey,
  onOpenAgentTab,
}: {
  keys: ProviderKeys;
  enabledModelIds: WireModelName[];
  agentOnline: boolean;
  onToggleModel: (modelId: WireModelName) => void;
  onToggleProvider: (provider: WireModelProvider, enabled: boolean) => void;
  onAddKey: (provider: ApiKeyProvider) => void;
  onOpenAgentTab: () => void;
}) {
  // One provider expanded at a time, all collapsed on arrival, so the tab opens
  // as a short list of providers rather than every model at once.
  const [openProvider, setOpenProvider] = useState<WireModelProvider | null>(null);

  return (
    <Panel
      title="Model access"
      description="Only the models switched on here appear in the composer. Turning one off never deletes a project."
    >
      <div className="space-y-8">
        {MODEL_PROVIDERS.map((provider) => {
          const models = WIRE_MODEL_OPTIONS.filter(
            (model) => model.provider === provider,
          );
          const enabledCount = models.filter((model) =>
            enabledModelIds.includes(model.id),
          ).length;
          const allEnabled = enabledCount === models.length;
          // For opencode the gate is a running agent, not a saved key.
          const hasKey =
            provider === "opencode" ? agentOnline : keys[provider as ApiKeyProvider];

          const expanded = openProvider === provider;

          return (
            <div key={provider}>
              <div className="flex items-end justify-between gap-4 pb-3">
                <button
                  type="button"
                  className="flex items-center gap-2 text-left"
                  onClick={() => setOpenProvider(expanded ? null : provider)}
                  aria-expanded={expanded}
                >
                  <ChevronRight
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      expanded ? "rotate-90" : ""
                    }`}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {providerLabel(provider)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                      {enabledCount} of {models.length} on
                    </span>
                  </span>
                </button>
                {hasKey ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onToggleProvider(provider, !allEnabled)}
                  >
                    {allEnabled ? "Turn all off" : "Turn all on"}
                  </Button>
                ) : provider === "opencode" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-foreground"
                    onClick={onOpenAgentTab}
                  >
                    Connect agent
                    <ArrowUpRight className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-foreground"
                    onClick={() => onAddKey(provider as ApiKeyProvider)}
                  >
                    Add key
                    <ArrowUpRight className="size-3.5" />
                  </Button>
                )}
              </div>

              {expanded ? (
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                {models.map((model) => {
                  const enabled = enabledModelIds.includes(model.id);

                  return (
                    <label
                      key={model.id}
                      className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/40"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {model.label}
                          </span>
                          {model.tier === "paid" ? (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                              Billed
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                          {model.id}
                        </span>
                      </span>
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => onToggleModel(model.id)}
                        aria-label={`${enabled ? "Disable" : "Enable"} ${model.label}`}
                      />
                    </label>
                  );
                })}
              </div>
              ) : null}

              {expanded && !hasKey && enabledCount > 0 ? (
                <p className="mt-2.5 text-xs text-muted-foreground">
                  {provider === "opencode"
                    ? "These stay listed but cannot run until your local agent is running."
                    : `These stay listed but cannot run until a ${providerLabel(provider)} key is connected.`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
