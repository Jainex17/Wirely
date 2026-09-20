"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

export interface AgentTokenSummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface LocalAgentPanelProps {
  initialTokens: AgentTokenSummary[];
  initialOnline: boolean;
}

const formatDate = (value: string | null) => {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Local agent settings.
 *
 * Mints and revokes the bearer tokens the Wirely agent uses, and reports
 * whether an agent is currently polling. Liveness is derived server-side from
 * how recently a token was used, so there is no heartbeat to subscribe to: the
 * panel hydrates from server props and refreshes on demand, matching the rest
 * of this settings page.
 */
export default function LocalAgentPanel({
  initialTokens,
  initialOnline,
}: LocalAgentPanelProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [online, setOnline] = useState(initialOnline);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Plaintext of a freshly minted token. The server cannot show it again. */
  const [newToken, setNewToken] = useState<string | null>(null);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/profile/agent-tokens", { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        tokens?: AgentTokenSummary[];
        online?: boolean;
      };
      if (!response.ok) throw new Error(payload.error || "Could not load agent status.");

      setTokens(payload.tokens ?? []);
      setOnline(payload.online === true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load agent status.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const createToken = async () => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/profile/agent-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Local agent" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        token?: { id: string; name: string; prefix: string; token: string };
      };
      if (!response.ok || !payload.token) {
        throw new Error(payload.error || "Could not create a token.");
      }

      setNewToken(payload.token.token);
      setCopied(false);
      setTokens((current) => [
        ...current,
        {
          id: payload.token!.id,
          name: payload.token!.name,
          prefix: payload.token!.prefix,
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.success("Token created. Copy it now, it is shown once.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a token.");
    } finally {
      setIsCreating(false);
    }
  };

  const revokeToken = async (tokenId: string) => {
    setRevokingId(tokenId);
    try {
      const response = await fetch("/api/profile/agent-tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not revoke the token.");

      setTokens((current) => current.filter((token) => token.id !== tokenId));
      toast.success("Token revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the token.");
    } finally {
      setRevokingId(null);
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      toast.success("Token copied.");
    } catch {
      toast.error("Could not copy. Select the token and copy it manually.");
    }
  };

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-12">
      <div className="md:pt-1">
        <h2 className="text-base font-semibold text-foreground">Local agent</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Generate designs through the opencode on your own machine, using the
          providers you signed into there. Your credentials never reach Wirely.
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
                <Terminal className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Agent status</p>
                  <Badge variant="outline" className="text-muted-foreground">
                    {online ? (
                      <>
                        <Check className="size-3" />
                        Connected
                      </>
                    ) : (
                      "Not running"
                    )}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {online
                    ? "An agent is polling for work right now."
                    : "Start the agent on your machine to generate concepts."}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={refresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh
            </Button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div>
              <p className="text-sm font-medium text-foreground">Setup</p>
              <ol className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li>
                  1. Install opencode 1.18 or newer, then run{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    opencode auth login
                  </code>
                </li>
                <li>2. Create a token below and copy it.</li>
                <li>
                  3. Run{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    npx wirely-agent login &lt;token&gt;
                  </code>
                </li>
                <li>
                  4. Start it with{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    npx wirely-agent
                  </code>
                </li>
              </ol>
            </div>
          </div>
        </div>

        {newToken ? (
          <div className="rounded-xl border border-primary/40 bg-primary/5 px-5 py-4">
            <p className="text-sm font-medium text-foreground">
              Copy your token now
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Wirely stores only a hash of it, so this is the one time it can be shown.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
                {newToken}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyToken}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setNewToken(null)}
            >
              Done
            </Button>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
            <p className="text-sm font-medium text-foreground">
              Tokens
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {tokens.length}
              </span>
            </p>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={createToken}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              New token
            </Button>
          </div>

          {tokens.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              No tokens yet. Create one to connect your machine.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {token.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {token.prefix}… · last used {formatDate(token.lastUsedAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => revokeToken(token.id)}
                    disabled={revokingId === token.id}
                  >
                    {revokingId === token.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
