import React from "react";
import { FileIcon } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import PageOptionsMenu from "./PageOptionsMenu";
import GeneratingPreviewPlaceholder from "./GeneratingPreviewPlaceholder";

interface PageRendererProps {
  page: {
    id: string;
    title: string;
    iframeUrl?: string;
    iframeHtml?: string;
  };
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  onPreviewPage: (pageId: string) => void;
  currentDevice: {
    width: number;
    height: number;
    label: string;
  };
}

export default React.memo(function PageRenderer({
  page,
  onRenamePage,
  onDeletePage,
  onPreviewPage,
  currentDevice,
}: PageRendererProps) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = React.useState(currentDevice.height);
  const hasHtml =
    typeof page.iframeHtml === "string" && page.iframeHtml.trim().length > 0;
  const isOnlyPage = useEditorStore((state) => state.pages.length <= 1);
  const syncIframeHeight = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
    const nextHeight = Math.max(
      currentDevice.height,
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
    );
    setIframeHeight(nextHeight);
  }, [currentDevice.height]);

  const handleLoad = React.useCallback(() => {
    syncIframeHeight();
    window.setTimeout(syncIframeHeight, 250);
    window.setTimeout(syncIframeHeight, 900);
  }, [syncIframeHeight]);

  React.useEffect(() => {
    if (hasHtml) return;
    setIframeHeight(currentDevice.height);
  }, [currentDevice.height, hasHtml, page.id]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full h-[50px] flex items-center pl-4 pr-2 rounded-[var(--radius)] justify-between bg-secondary">
        <p className="text-foreground font-medium text-md flex items-center gap-2">
          <FileIcon width={18} />
          {page.title}
        </p>
        <PageOptionsMenu
          pageTitle={page.title}
          isOnlyPage={isOnlyPage}
          onRename={(newTitle) => onRenamePage(page.id, newTitle)}
          onDelete={() => onDeletePage(page.id)}
          onPreview={() => onPreviewPage(page.id)}
        />
      </div>
      <div
        className="bg-transparent rounded-[var(--radius)] relative border border-border shadow-lg overflow-hidden"
        style={{
          width: `${currentDevice.width}px`,
          minHeight: `${currentDevice.height}px`,
          height: hasHtml ? `${iframeHeight}px` : `${currentDevice.height}px`,
        }}
      >
        {hasHtml ? (
          <iframe
            ref={iframeRef}
            title={page.title}
            srcDoc={page.iframeHtml}
            onLoad={handleLoad}
            className="h-full w-full border-0 pointer-events-none"
            style={{ overflow: "hidden" }}
            loading="lazy"
            sandbox="allow-same-origin allow-scripts"
            referrerPolicy="no-referrer"
            scrolling="no"
          />
        ) : (
          <GeneratingPreviewPlaceholder />
        )}
      </div>
    </div>
  );
});
