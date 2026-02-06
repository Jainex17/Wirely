import React from "react";
import { FileIcon } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import PageOptionsMenu from "./PageOptionsMenu";

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
  const iframeSrc = page.iframeUrl ?? "/login";
  const hasHtml =
    typeof page.iframeHtml === "string" && page.iframeHtml.trim().length > 0;
  const isOnlyPage = useEditorStore((state) => state.pages.length <= 1);

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
        className="bg-white rounded-[var(--radius)] relative border border-border shadow-lg overflow-hidden"
        style={{
          width: `${currentDevice.width}px`,
          height: `${currentDevice.height}px`,
        }}
      >
        <iframe
          title={page.title}
          src={hasHtml ? undefined : iframeSrc}
          srcDoc={hasHtml ? page.iframeHtml : undefined}
          className="h-full w-full border-0 pointer-events-none"
          loading="lazy"
          sandbox=""
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
});
