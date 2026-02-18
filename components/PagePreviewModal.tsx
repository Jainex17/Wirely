"use client";

import React from "react";
import { Monitor, XIcon } from "lucide-react";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import GeneratingPreviewPlaceholder from "./GeneratingPreviewPlaceholder";

interface PagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  page: { title: string; iframeUrl?: string; iframeHtml?: string } | null;
}

export default function PagePreviewModal({
  isOpen,
  onClose,
  page,
}: PagePreviewModalProps) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const hasRawHtml =
    typeof page?.iframeHtml === "string" && page.iframeHtml.trim().length > 0;
  const sanitizedHtml = React.useMemo(
    () => (hasRawHtml ? sanitizeIframeHtml(page?.iframeHtml ?? "") : ""),
    [hasRawHtml, page?.iframeHtml],
  );
  const hasHtml = sanitizedHtml.trim().length > 0;

  const handleLoad = React.useCallback(() => {
    let doc: Document | null = null;
    try {
      doc = iframeRef.current?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) return;
    doc.documentElement.style.overflow = "auto";
    doc.body.style.overflow = "auto";
  }, []);

  if (!isOpen || !page) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="absolute top-12 left-4 right-4 bottom-4 flex flex-col animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-foreground/10 rounded-t-xl">
          <div className="flex items-center gap-2 text-foreground">
            <Monitor width={18} />
            <span className="text-sm font-medium">Preview: {page.title}</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/10 transition-colors"
          >
            <XIcon width={18} className="text-foreground" />
          </button>
        </div>
        <div className="relative flex-1 bg-transparent overflow-hidden shadow-2xl rounded-b-xl">
          {hasHtml ? (
            <iframe
              ref={iframeRef}
              title={`Preview ${page.title}`}
              srcDoc={sanitizedHtml}
              className="h-full w-full border-0"
              style={{ overflow: "auto" }}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              onLoad={handleLoad}
            />
          ) : (
            <GeneratingPreviewPlaceholder />
          )}
        </div>
      </div>
    </div>
  );
}
