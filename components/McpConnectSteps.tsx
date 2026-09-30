"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildConnectSnippet, MCP_CLIENTS, type McpClientId } from "@/lib/mcp/connectSnippet";

const noopSubscribe = () => () => {};

/**
 * The client picker, snippet, and next step for connecting an MCP client.
 * Home and the settings MCP tab both render this. Pass `token` to show the
 * bearer-header variant instead of the OAuth one.
 */
export default function McpConnectSteps({ token }: { token?: string }) {
  const [clientId, setClientId] = useState<McpClientId>("claude-code");
  const [copied, setCopied] = useState(false);
  // The server URL on the host the user is browsing, so the snippet works on
  // localhost and in production alike. The origin is unknown during SSR.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
  const serverUrl = origin ? `${origin}/api/mcp` : "";

  const steps = serverUrl ? buildConnectSnippet(clientId, serverUrl, token) : null;

  const copy = async () => {
    if (!steps) return;
    try {
      await navigator.clipboard.writeText(steps.snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  };

  return (
    <div className="space-y-3 text-left">
      <Tabs
        value={clientId}
        onValueChange={(value) => {
          setClientId(value as McpClientId);
          setCopied(false);
        }}
      >
        <TabsList aria-label="Coding agent">
          {MCP_CLIENTS.map((client) => (
            <TabsTrigger key={client.id} value={client.id} className="px-3 text-[13px]">
              {client.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {steps ? (
        <>
          {steps.installUrl ? (
            <Button asChild size="sm">
              <a href={steps.installUrl}>Add to Cursor</a>
            </Button>
          ) : null}
          <div>
            <p className="text-xs text-muted-foreground">{steps.target}</p>
            <div className="relative mt-1.5">
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-background py-2.5 pl-3 pr-10 font-mono text-xs leading-relaxed text-foreground">
                {steps.snippet}
              </pre>
              <button
                type="button"
                onClick={() => void copy()}
                aria-label="Copy snippet"
                className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">{steps.next}</p>
        </>
      ) : null}
    </div>
  );
}
