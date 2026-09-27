"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

import McpConnectCard from "@/components/McpConnectCard";
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

/** MCP settings: the connect card plus the list of live tokens to revoke. */
export default function McpPanel({ initialTokens }: McpPanelProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  /** The token inside the card's install prompt. Revoking it resets the card. */
  const [promptTokenId, setPromptTokenId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState(0);

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
      // Only the prompt's own token closes the prompt. Revoking an older one
      // (say, one another client already uses) must not.
      if (tokenId === promptTokenId) {
        setPromptTokenId(null);
        setCardKey((key) => key + 1);
      }
      toast.success("Token revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the token.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-12">
      <div className="md:pt-1">
        <h2 className="text-base font-semibold text-foreground">MCP</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Use Wirely from Claude Code, Cursor, Codex, or opencode. Your
          agent&apos;s model designs the screens on your own plan. Wirely stores
          them on your canvas and previews them.
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        <McpConnectCard
          key={cardKey}
          onTokenCreated={(token) => {
            setPromptTokenId(token.id);
            setTokens((current) => [
              ...current,
              { ...token, lastUsedAt: null, createdAt: new Date().toISOString() },
            ]);
          }}
        />

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
                      {token.id === promptTokenId ? (
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
