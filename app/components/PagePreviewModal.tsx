"use client";

import { Monitor, XIcon } from "lucide-react";

interface PagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  page: { title: string; iframeUrl?: string } | null;
}

export default function PagePreviewModal({
  isOpen,
  onClose,
  page,
}: PagePreviewModalProps) {
  if (!isOpen || !page) return null;

  const iframeSrc = page.iframeUrl ?? "/login";

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="absolute top-12 left-4 right-4 bottom-4 flex flex-col animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-xl">
          <div className="flex items-center gap-2 text-gray-600">
            <Monitor width={18} />
            <span className="text-sm font-medium">Preview: {page.title}</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <XIcon width={18} className="text-gray-500" />
          </button>
        </div>
        <div className="relative flex-1 bg-white overflow-hidden shadow-2xl rounded-b-xl">
          <iframe
            title={`Preview ${page.title}`}
            src={iframeSrc}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
