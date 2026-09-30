"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/** MCP settings: connect a client, then see and revoke the connected ones. */
export default function McpPanel({ initialTokens }: McpPanelProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  /** The token inside the card's snippet. Revoking it resets the card. */
  const [promptTokenId, setPromptTokenId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState(0);

  // The OAuth flow finishes in another browser tab, so reload the list when
  // the user comes back to this one and the new client shows up.
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/profile/agent-tokens", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { tokens?: AgentTokenSummary[] };
        if (payload.tokens) setTokens(payload.tokens);
      } catch {
        // The list stays as it was; the next focus retries.
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

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
      // Only the snippet's own token resets the card. Revoking an older one
      // (say, one another client already uses) must not.
      if (tokenId === promptTokenId) {
        setPromptTokenId(null);
        setCardKey((key) => key + 1);
      }
      toast.success("Access revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the token.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-10">
      <section>
        <h2 className="mb-3 text-sm font-medium text-foreground">Connect your coding agent</h2>
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
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-foreground">Connected clients</h2>
        <div className="rounded-xl border border-border bg-card">
          {tokens.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              No clients yet. Connect one above.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {tokens.map((token) => (
                <li key={token.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${
                      token.lastUsedAt ? "bg-emerald-500" : "bg-muted-foreground/30"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {token.name}
                      {token.id === promptTokenId ? (
                        <Badge variant="outline" className="ml-2 align-middle text-muted-foreground">
                          in the snippet
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{token.prefix}…</span>
                      {" · "}
                      {token.lastUsedAt
                        ? `last used ${formatDate(token.lastUsedAt)}`
                        : "not used yet"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => revokeToken(token.id)}
                    disabled={revokingId === token.id}
                  >
                    {revokingId === token.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
