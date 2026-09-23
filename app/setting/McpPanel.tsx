"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  buildInstallPrompt,
  MCP_CLIENTS,
  type McpClientId,
} from "@/lib/mcp/installPrompt";

export interface AgentTokenSummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface McpPanelProps {
  initialTokens: AgentTokenSummary[];
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

const MCP_PATH = "/api/mcp";

/**
 * MCP settings.
 *
 * The install flow is one paste: create a token, copy the prompt for the
 * client, and paste it there — that client's own agent edits its config. The
 * prompt embeds the freshly minted token, so it is only offered while that
 * token is in hand; revoking it closes the prompt again.
 */
export default function McpPanel({ initialTokens }: McpPanelProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  /** Plaintext of a freshly minted token. The server cannot show it again. */
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newTokenId, setNewTokenId] = useState<string | null>(null);
  const [showRawToken, setShowRawToken] = useState(false);
  const [clientId, setClientId] = useState<McpClientId>("opencode");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const serverUrl = origin ? `${origin}${MCP_PATH}` : "";
  const selectedClient =
    MCP_CLIENTS.find((client) => client.id === clientId) ?? MCP_CLIENTS[0];
  const installPrompt =
    newToken && serverUrl
      ? buildInstallPrompt(clientId, serverUrl, newToken)
      : "";

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/profile/agent-tokens", { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        tokens?: AgentTokenSummary[];
      };
      if (!response.ok) throw new Error(payload.error || "Could not load tokens.");

      setTokens(payload.tokens ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load tokens.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const createToken = async () => {
    setIsCreating(true);
    setShowRawToken(false);
    try {
      const response = await fetch("/api/profile/agent-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MCP client" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        token?: { id: string; name: string; prefix: string; token: string };
      };
      if (!response.ok || !payload.token) {
        throw new Error(payload.error || "Could not create a token.");
      }

      setNewToken(payload.token.token);
      setNewTokenId(payload.token.id);
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
      toast.success("Token created. Now copy the install prompt.");
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
      // Only the prompt's own token closes the prompt; revoking an older one
      // (say, a wirely-agent CLI token) must not.
      if (tokenId === newTokenId) {
        setNewToken(null);
        setNewTokenId(null);
        setShowRawToken(false);
      }
      toast.success("Token revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the token.");
    } finally {
      setRevokingId(null);
    }
  };

  const copy = async (field: string, value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success(message);
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  };

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-12">
      <div className="md:pt-1">
        <h2 className="text-base font-semibold text-foreground">MCP</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Use Wirely from any MCP client — opencode, Cursor, Claude Code. The
          client&apos;s own model designs the screens; Wirely stores them on
          your canvas and previews them.
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
                <Plug className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Connect a client</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Paste one prompt into your client and it installs Wirely itself.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-muted-foreground">
              streamable HTTP
            </Badge>
          </div>

          <div className="space-y-4 px-5 py-5">
            {newToken ? (
              <>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                    <p className="text-sm font-medium text-foreground">
                      Token created
                    </p>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {newToken.slice(0, 13)}…
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRawToken((value) => !value)}
                    >
                      {showRawToken ? "Hide token" : "Show token"}
                    </Button>
                  </div>
                  {showRawToken ? (
                    <div className="mt-2 flex items-center gap-2 pl-7">
                      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
                        {newToken}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => copy("token", newToken, "Token copied.")}
                      >
                        {copiedField === "token" ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        Copy
                      </Button>
                    </div>
                  ) : null}
                  <p className="mt-1.5 pl-7 text-xs leading-relaxed text-muted-foreground">
                    The raw token is only needed for the{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                      wirely-agent
                    </code>{" "}
                    CLI. For everything else, use the prompt below.
                  </p>
                </div>

                <div className="border-t border-border/60 pt-4">
                  <p className="text-sm font-medium text-foreground">
                    Paste this prompt into your client
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2" role="tablist" aria-label="MCP client">
                    {MCP_CLIENTS.map((client) => (
                      <Button
                        key={client.id}
                        type="button"
                        role="tab"
                        aria-selected={client.id === clientId}
                        variant={client.id === clientId ? "default" : "outline"}
                        size="sm"
                        onClick={() => setClientId(client.id)}
                      >
                        {client.label}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-start gap-2">
                    <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                      {installPrompt}
                    </pre>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        copy(
                          "prompt",
                          installPrompt,
                          `Prompt copied. Paste it into ${selectedClient.label}.`,
                        )
                      }
                    >
                      {copiedField === "prompt" ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      Copy prompt
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The prompt contains your token, so only paste it into your own{" "}
                    {selectedClient.label}.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Create a token and Wirely builds you a copy-paste prompt that
                  carries it — your client then adds Wirely without any manual
                  config editing.
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
                  Create a token
                </Button>
              </div>
            )}

            {serverUrl ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                Server URL: {serverUrl}
              </p>
            ) : null}
          </div>
        </div>

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

          {tokens.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              No tokens yet. Create one above to connect your client.
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
                      {token.id === newTokenId ? (
                        <Badge
                          variant="outline"
                          className="ml-2 align-middle text-muted-foreground"
                        >
                          this prompt
                        </Badge>
                      ) : null}
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
