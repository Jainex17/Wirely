"use client";

import { type DragEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { assetPath } from "@/lib/assetPaths";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface Asset {
  id: string;
  name: string;
  width: number;
  height: number;
  byteSize: number;
}

// Vercel caps request bodies at 4.5 MB; the server takes up to 4 MB.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const SHRINK_MAX_DIMENSION = 2560;

/**
 * Scales a photo too big to send down to 2560 px on its long side. The server
 * would scale it to that size anyway, so nothing a design shows is lost.
 */
const shrinkForUpload = async (file: File): Promise<Blob> => {
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SHRINK_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.92),
  );
  if (!blob || blob.size > MAX_UPLOAD_BYTES)
    throw new Error(`${file.name} is too large to upload.`);
  return blob;
};

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * The project's images, as a folder in the pages panel. The user uploads files
 * here or asks their agent to, and pages use them by path. Clicking one copies
 * its path for a prompt.
 */
export default function AssetsFolder({ projectId }: { projectId: string }) {
  const [isOpen, setIsOpen] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "failed">("loading");
  const [uploadCount, setUploadCount] = useState(0);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/assets`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`List failed with status ${response.status}`);
        const payload = (await response.json()) as { assets: Asset[]; unavailable?: boolean };
        if (cancelled) return;
        setAssets(payload.assets);
        setStatus(payload.unavailable ? "unavailable" : "ready");
      })
      .catch((error: unknown) => {
        logger.error("assets_list_failed", { projectId, error });
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const upload = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploadCount((count) => count + images.length);
    for (const file of images) {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/assets?name=${encodeURIComponent(file.name)}`,
          { method: "POST", body: await shrinkForUpload(file) },
        );
        const payload = (await response.json().catch(() => null)) as {
          asset?: Asset;
          error?: string;
        } | null;
        if (!response.ok || !payload?.asset) throw new Error(payload?.error || "Upload failed.");
        const asset = payload.asset;
        setAssets((current) => [...current, asset]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not upload ${file.name}.`);
      } finally {
        setUploadCount((count) => count - 1);
      }
    }
  };

  const remove = async (asset: Asset) => {
    if (!window.confirm(`Delete ${asset.name}? Pages that use it will show a broken image.`))
      return;
    const response = await fetch(`/api/projects/${projectId}/assets/${asset.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("Could not delete the image. Try again.");
      return;
    }
    setAssets((current) => current.filter((candidate) => candidate.id !== asset.id));
  };

  const copyPath = async (asset: Asset) => {
    try {
      await navigator.clipboard.writeText(assetPath(asset.id));
      toast.success(`Copied the path to ${asset.name}. Paste it in a prompt or an <img>.`);
    } catch {
      toast.error("Could not copy the path.");
    }
  };

  const handleDrop = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setIsDropTarget(false);
    setIsOpen(true);
    void upload([...event.dataTransfer.files]);
  };

  const canUpload = status === "ready";

  return (
    <div
      className={cn("shrink-0 border-t border-sidebar-border", isDropTarget && "bg-primary/10")}
      onDragOver={(event) => {
        if (!canUpload || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setIsDropTarget(false);
      }}
      onDrop={canUpload ? handleDrop : undefined}
    >
      <div className="flex h-8 items-center gap-1.5 px-3">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-semibold text-foreground"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              !isOpen && "-rotate-90",
            )}
          />
          Assets
          <span className="font-normal tabular-nums text-muted-foreground">
            {assets.length || ""}
          </span>
        </button>
        {uploadCount > 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
        <button
          type="button"
          disabled={!canUpload}
          onClick={() => inputRef.current?.click()}
          aria-label="Upload images"
          title="Upload images"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          multiple
          hidden
          onChange={(event) => {
            void upload([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </div>
      {isOpen ? (
        <div className="max-h-48 overflow-y-auto pb-2">
          {status === "unavailable" ? (
            <p className="px-3 text-[11px] text-muted-foreground">
              Images are not set up on this server yet.
            </p>
          ) : status === "failed" ? (
            <p className="px-3 text-[11px] text-muted-foreground">Could not load images.</p>
          ) : status === "ready" && assets.length === 0 ? (
            <p className="px-3 text-[11px] leading-relaxed text-muted-foreground">
              Drop images here, or ask your agent to add one from your computer.
            </p>
          ) : (
            assets.map((asset) => (
              <div
                key={asset.id}
                className="group flex h-8 items-center gap-2 pl-8 pr-2 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                <button
                  type="button"
                  onClick={() => void copyPath(asset)}
                  title="Copy path"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from this app, already compressed */}
                  <img
                    src={assetPath(asset.id)}
                    alt=""
                    loading="lazy"
                    className="h-6 w-6 shrink-0 rounded-sm border border-border object-cover"
                  />
                  <span className="truncate">{asset.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-[10px]">
                    {formatSize(asset.byteSize)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(asset)}
                  aria-label={`Delete ${asset.name}`}
                  title="Delete"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
