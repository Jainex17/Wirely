"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/app/store/useEditorStore";

interface WirePromptSidebarProps {
  wireId: string;
  variant?: "floating" | "panel";
}

export default function WirePromptSidebar({
  wireId,
  variant = "floating",
}: WirePromptSidebarProps) {
  const [prompt, setPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoRunRef = useRef(false);
  const setPageHtml = useEditorStore((state) => state.setPageHtml);

  const {
    messages,
    append,
    isLoading,
    stop,
  } = useChat({
    api: `/api/wire/${wireId}`,
    body: { wireId },
    onResponse: async (response) => {
      if (!response.ok) {
        const text = await response.text();
        setErrorMessage(
          text?.trim() || "Can't process request due to insufficient funds.",
        );
        stop();
        return;
      }
      setErrorMessage(null);
    },
    onError: () => {
      setErrorMessage("Can't process request due to insufficient funds.");
      stop();
    },
    onFinish: (message) => {
      const html = extractHtml(message.content);
      const targetPageId = useEditorStore.getState().pages[0]?.id;
      if (html && targetPageId) {
        setPageHtml(targetPageId, html, "Generated Page");
      }
    },
  });

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isLoading) return;
      const trimmed = prompt.trim();
      if (!trimmed) return;

      setPrompt("");
      await append({ role: "user", content: trimmed });
    },
    [append, isLoading, prompt],
  );

  useEffect(() => {
    if (autoRunRef.current) return;
    const storedPrompt = sessionStorage.getItem(`wirePrompt:${wireId}`);
    if (!storedPrompt) return;
    autoRunRef.current = true;
    sessionStorage.removeItem(`wirePrompt:${wireId}`);
    setPrompt("");
    append({ role: "user", content: storedPrompt });
  }, [append, wireId]);

  const containerClassName =
    variant === "panel"
      ? "h-full w-full p-4 flex flex-col gap-4 bg-transparent text-neutral-100"
      : "fixed right-5 top-5 bottom-5 w-80 p-4 flex flex-col gap-4 bg-transparent text-neutral-100";

  const renderedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const key = message.id ?? `${message.role}-${index}`;
      if (message.role === "user") {
        return (
          <div
            key={key}
            className="ml-auto max-w-[85%] rounded-2xl bg-neutral-200 text-neutral-900 px-4 py-3 text-sm"
          >
            {message.content}
          </div>
        );
      }

      if (message.role === "assistant") {
        const details = extractDetails(message.content);
        if (!details) return null;
        return (
          <div
            key={key}
            className="max-w-[85%] rounded-2xl bg-neutral-800/60 px-4 py-3 text-sm text-neutral-100"
          >
            {details}
          </div>
        );
      }

      return null;
    });
  }, [messages]);

  return (
    <aside className={containerClassName}>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {renderedMessages}
        {errorMessage ? (
          <div className="max-w-[85%] rounded-2xl bg-neutral-800/60 px-4 py-3 text-sm text-neutral-100">
            {errorMessage}
          </div>
        ) : null}
        {isLoading ? (
          <div className="max-w-[85%] rounded-2xl bg-neutral-800/40 px-4 py-3 text-sm text-neutral-200">
            Generating...
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask a follow-up..."
          rows={4}
          className="w-full resize-none bg-neutral-900/60 border border-white/10 text-neutral-100 placeholder:text-neutral-500 rounded-2xl px-4 py-3 pr-12 leading-5 focus:outline-none focus:ring-2 focus:ring-white/10"
        />
        <Button
          type="submit"
          disabled={isLoading}
          className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full p-0 bg-neutral-200 text-neutral-900 hover:bg-white"
          aria-label="Send"
        >
          {isLoading ? "…" : "→"}
        </Button>
      </form>
    </aside>
  );
}

const DETAILS_MARKER = "DETAILS:";
const HTML_MARKER = "HTML:";

const extractDetails = (content: string) => {
  const detailsIndex = content.indexOf(DETAILS_MARKER);
  if (detailsIndex === -1) return "";
  const start = detailsIndex + DETAILS_MARKER.length;
  const htmlIndex = content.indexOf(HTML_MARKER, start);
  const slice = htmlIndex === -1 ? content.slice(start) : content.slice(start, htmlIndex);
  return slice.trim();
};

const extractHtml = (content: string) => {
  const htmlIndex = content.indexOf(HTML_MARKER);
  if (htmlIndex === -1) return "";
  return content.slice(htmlIndex + HTML_MARKER.length).trimStart();
};
