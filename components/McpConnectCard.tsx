"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Copy, Loader2, Plug, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  buildInstallPrompt,
  MCP_CLIENTS,
  type McpClientId,
} from "@/lib/mcp/installPrompt";

export interface CreatedAgentToken {
  id: string;
  name: string;
  prefix: string;
}

interface McpConnectCardProps {
  /** Settings adds the new token to its list; home ignores it. */
  onTokenCreated?: (token: CreatedAgentToken) => void;
}

const MCP_PATH = "/api/mcp";
const CONNECTION_POLL_MS = 3_000;
// A user who never finishes the install should not poll forever.
const CONNECTION_POLL_LIMIT_MS = 10 * 60_000;

/**
 * Connects an MCP client in one paste: create a token, copy the prompt for the
 * client, and paste it there. That client's own agent edits its config. The
 * prompt embeds the freshly minted token, so it is only offered while that
 * token is in hand. After that the card polls the token list until the client
 * makes its first call, so the user sees the install worked.
 */
export default function McpConnectCard({ onTokenCreated }: McpConnectCardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  /** Plaintext of a freshly minted token. The server cannot show it again. */
  const [newToken, setNewToken] = useState<{ id: string; token: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showRawToken, setShowRawToken] = useState(false);
  const [clientId, setClientId] = useState<McpClientId>("claude-code");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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

  const serverUrl = origin ? `${origin}${MCP_PATH}` : "";
  const selectedClient =
    MCP_CLIENTS.find((client) => client.id === clientId) ?? MCP_CLIENTS[0];
  const installPrompt =
    newToken && serverUrl ? buildInstallPrompt(clientId, serverUrl, newToken.token) : "";

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
    <div className="rounded-xl border border-border bg-card text-left">
      <div
        className={`flex items-center gap-3.5 px-4 py-3.5 ${
          newToken ? "border-b border-border/60" : ""
        }`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
          <Plug className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Connect your coding agent</p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            Claude Code, Cursor, Codex, or opencode, on your own plan.
          </p>
        </div>
        {newToken ? null : (
          <Button
            type="button"
            size="sm"
            className="shrink-0 transition-transform active:scale-[0.97]"
            onClick={createToken}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Connect
          </Button>
        )}
      </div>

      {newToken ? (
        <div className="space-y-4 px-5 py-5">
            <div>
              <p className="text-sm font-medium text-foreground">
                1. Paste this prompt into your agent
              </p>
              <div
                className="mt-2 flex flex-wrap items-center gap-2"
                role="tablist"
                aria-label="MCP client"
              >
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
                    copy("prompt", installPrompt, `Prompt copied. Paste it into ${selectedClient.label}.`)
                  }
                >
                  {copiedField === "prompt" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  Copy
                </Button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                The prompt carries your token, so only paste it into your own{" "}
                {selectedClient.label}.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setShowRawToken((value) => !value)}
                >
                  {showRawToken ? "Hide the raw token" : "Configure by hand instead"}
                </button>
              </p>
              {showRawToken ? (
                <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-background px-2.5 py-1.5 text-foreground">
                      {newToken.token}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => copy("token", newToken.token, "Token copied.")}
                    >
                      {copiedField === "token" ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      Token
                    </Button>
                  </div>
                  <p>Server URL: {serverUrl}</p>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 border-t border-border/60 pt-4 text-sm">
              {isConnected ? (
                <>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                  <span className="text-foreground">
                    Connected. Ask your agent to design something in Wirely.
                  </span>
                </>
              ) : (
                <>
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    2. Restart your agent. This turns green on its first call.
                  </span>
                </>
              )}
            </div>
        </div>
      ) : null}
    </div>
  );
}
