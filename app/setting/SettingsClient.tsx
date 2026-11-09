"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import McpPanel, { type AgentTokenSummary } from "./McpPanel";

export type SettingsTab = "account" | "providers" | "models" | "mcp";
export type ProviderKeys = Record<ApiKeyProvider, boolean>;

interface SettingsClientProps {
  user: { name: string | null; email: string | null; avatarUrl: string | null };
  initialKeys: ProviderKeys;
  initialEnabledModelIds: WireModelName[];
  initialTab: SettingsTab;
  initialAgentTokens: AgentTokenSummary[];
  /**
   * "modal" when a link inside the app opened settings over the page the user
   * was on, so closing goes back there. "page" for a direct visit or a reload.
   */
  variant: "modal" | "page";
}

/** The left column, grouped the way the product is used: agents first, in-app generation after. */
const NAV: Array<{ label?: string; tabs: Array<{ id: SettingsTab; label: string; icon: typeof Plug }> }> = [
  { tabs: [{ id: "account", label: "Account", icon: UserRound }] },
  { label: "Agents", tabs: [{ id: "mcp", label: "MCP", icon: Plug }] },
  {
    label: "In-app generation",
    tabs: [
      { id: "providers", label: "Providers", icon: KeyRound },
      { id: "models", label: "Models", icon: Boxes },
    ],
  },
];

const MODEL_PROVIDERS: WireModelProvider[] = ["google", "openrouter", "zai"];

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
  variant,
}: SettingsClientProps) {
  const router = useRouter();
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
    if (!snapshot) {
      // A silent revert reads as "the toggle is broken" — say so.
      setEnabledModelIds(previousIds);
      toast.error("Could not save that change. Try again.");
    }
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
  const meta: Partial<Record<SettingsTab, string>> = {
    providers: `${connectedKeyCount}/4`,
    models: `${enabledModelIds.length}/${WIRE_MODEL_OPTIONS.length}`,
  };
  const tabLabel = NAV.flatMap((group) => group.tabs).find((item) => item.id === tab)?.label;
  // A modal goes back to the page it opened over. A direct visit has no such
  // page, so it goes to the projects list.
  const close = () => (variant === "modal" ? router.back() : router.push("/projects"));

  return (
    <div className="flex min-h-0 w-full max-sm:flex-col">
      <nav
        aria-label="Settings sections"
        className="flex shrink-0 flex-col gap-4 overflow-y-auto border-border/70 bg-sidebar p-3 max-sm:flex-row max-sm:gap-1 max-sm:overflow-x-auto max-sm:border-b sm:w-56 sm:border-r"
      >
        {NAV.map((group, index) => (
          <div key={group.label ?? index} className="flex flex-col gap-0.5 max-sm:flex-row">
            {group.label ? (
              <p className="px-2.5 pb-1 text-xs text-muted-foreground max-sm:hidden">{group.label}</p>
            ) : null}
            {group.tabs.map((item) => {
              const isActive = item.id === tab;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                  className={`flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-foreground/[0.07] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                  {meta[item.id] ? (
                    <span className="ml-auto pl-2 font-mono text-[11px] text-muted-foreground">
                      {meta[item.id]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/70 pl-6 pr-3">
          <p className="truncate text-sm">
            <span className="text-muted-foreground">Settings</span>
            <span className="mx-2 text-muted-foreground/60">/</span>
            <span className="text-foreground">{tabLabel}</span>
          </p>
          <button
            type="button"
            aria-label="Close settings"
            onClick={close}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-8">
            {tab === "account" ? <AccountPanel user={user} /> : null}
            {tab === "providers" ? (
              <ProvidersPanel keys={keys} onManage={setDialogProvider} />
            ) : null}
            {tab === "models" ? (
              <ModelsPanel
                keys={keys}
                enabledModelIds={enabledModelIds}
                onToggleModel={toggleModel}
                onToggleProvider={setProviderModels}
                onAddKey={setDialogProvider}
              />
            ) : null}
            {tab === "mcp" ? <McpPanel initialTokens={initialAgentTokens} /> : null}
          </div>
        </div>
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
    <section>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      <div className="mt-4 min-w-0">{children}</div>
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

function ModelRow({
  modelId,
  label,
  hint,
  enabled,
  onToggle,
}: {
  modelId: WireModelName;
  label: string;
  hint?: string;
  enabled: boolean;
  onToggle: (modelId: WireModelName) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40 ${
        enabled ? "bg-primary/5" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={() => onToggle(modelId)}
        aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
      />
    </label>
  );
}

function ModelsPanel({
  keys,
  enabledModelIds,
  onToggleModel,
  onToggleProvider,
  onAddKey,
}: {
  keys: ProviderKeys;
  enabledModelIds: WireModelName[];
  onToggleModel: (modelId: WireModelName) => void;
  onToggleProvider: (provider: WireModelProvider, enabled: boolean) => void;
  onAddKey: (provider: ApiKeyProvider) => void;
}) {
  const [openProvider, setOpenProvider] = useState<WireModelProvider | null>(
    "google",
  );

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
          const hasKey = keys[provider];

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
                      {PROVIDERS[provider].label}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                      {enabledCount} of {models.length} on
                    </span>
                  </span>
                </button>
                {!hasKey ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-foreground"
                    onClick={() => onAddKey(provider)}
                  >
                    Add key
                    <ArrowUpRight className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onToggleProvider(provider, !allEnabled)}
                  >
                    {allEnabled ? "Turn all off" : "Turn all on"}
                  </Button>
                )}
              </div>

              {expanded ? (
                <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                  <div className="divide-y divide-border/60">
                    {models.map((model) => (
                      <ModelRow
                        key={model.id}
                        modelId={model.id}
                        label={model.label}
                        hint={model.id}
                        enabled={enabledModelIds.includes(model.id)}
                        onToggle={onToggleModel}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {expanded && !hasKey && enabledCount > 0 ? (
                <p className="mt-2.5 text-xs text-muted-foreground">
                  {`These stay listed but cannot run until a ${PROVIDERS[provider].label} key is connected.`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
