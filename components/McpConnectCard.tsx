"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";

import McpConnectSteps from "@/components/McpConnectSteps";
import { toast } from "@/components/ui/sonner";

export interface CreatedAgentToken {
  id: string;
  name: string;
  prefix: string;
}

interface McpConnectCardProps {
  /** Settings adds the new token to its list. */
  onTokenCreated?: (token: CreatedAgentToken) => void;
}

const CONNECTION_POLL_MS = 3_000;
// A user who never finishes the install should not poll forever.
const CONNECTION_POLL_LIMIT_MS = 10 * 60_000;

/**
 * The settings connect card. It leads with the OAuth snippet. A client that
 * cannot open a browser can switch to a freshly minted token instead, and the
 * card then polls the token list until that token makes its first call, so the
 * user sees it worked.
 */
export default function McpConnectCard({ onTokenCreated }: McpConnectCardProps) {
  const [isCreating, setIsCreating] = useState(false);
  /** Plaintext of a freshly minted token. The server cannot show it again. */
  const [newToken, setNewToken] = useState<{ id: string; token: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const newTokenId = newToken?.id;
  useEffect(() => {
    if (!newTokenId || isConnected) return;
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAt > CONNECTION_POLL_LIMIT_MS) {
        window.clearInterval(timer);
        return;
      }
      try {
        const response = await fetch("/api/profile/agent-tokens", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          tokens?: Array<{ id: string; lastUsedAt: string | null }>;
        };
        if (payload.tokens?.some((token) => token.id === newTokenId && token.lastUsedAt)) {
          setIsConnected(true);
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, CONNECTION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [newTokenId, isConnected]);

  const createToken = async () => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/profile/agent-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MCP client" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        token?: CreatedAgentToken & { token: string };
      };
      if (!response.ok || !payload.token) {
        throw new Error(payload.error || "Could not create a token.");
      }

      setNewToken({ id: payload.token.id, token: payload.token.token });
      setIsConnected(false);
      onTokenCreated?.({
        id: payload.token.id,
        name: payload.token.name,
        prefix: payload.token.prefix,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a token.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-5">
        <McpConnectSteps token={newToken?.token} />
        {newToken ? (
          <p className="mt-3 text-xs text-muted-foreground">
            This snippet holds your token and is shown once. Only paste it into your own client.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-xs">
        {newToken ? (
          <span className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Check className="size-3.5 text-primary" />
                <span className="text-foreground">Connected.</span>
              </>
            ) : (
              <>
                <Circle className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Waiting for the first call.</span>
              </>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">Client can&apos;t open a browser?</span>
        )}
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          disabled={isCreating}
          onClick={newToken ? () => setNewToken(null) : createToken}
        >
          {isCreating ? <Loader2 className="size-3 animate-spin" /> : null}
          {newToken ? "Use browser sign-in" : "Use a token"}
        </button>
      </div>
    </div>
  );
}
