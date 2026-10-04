/**
 * Dragging a project image out of the assets folder: onto a page on the
 * canvas, onto a layer, or onto empty canvas, where it becomes a vector page
 * the size of the image. The image is always referenced by its
 * `/api/assets/<id>` path, which both page sanitizers already allow, so no
 * new host ever enters a page. Client safe.
 */
import { ASSET_PATH_PATTERN, assetPath } from "@/lib/assetPaths";
import { prepareArtboardHtml } from "@/lib/vectorArtboard";

/** The dataTransfer type, which dragover can see before the drop reveals the data. */
export const ASSET_DRAG_TYPE = "application/x-wirely-asset";

export interface DraggedAsset {
  id: string;
  name: string;
  width: number;
  height: number;
}

// Widest an image lands inside a page, so a 2560px photo does not blow out
// the layout. It keeps its aspect ratio and never grows past its container.
const MAX_INSERTED_WIDTH = 640;
// Longest side of a vector page made from an image, within the artboard limit.
const MAX_ARTBOARD_SIDE = 2048;

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100_000;

/**
 * The asset a drop carries, or null for anything else. The data could come
 * from another tab or app, so the id must be an asset id and the sizes sane.
 */
export const parseAssetDrag = (raw: string): DraggedAsset | null => {
  try {
    const value = JSON.parse(raw) as Partial<DraggedAsset>;
    if (typeof value.id !== "string" || !ASSET_PATH_PATTERN.test(assetPath(value.id))) return null;
    if (!isSize(value.width) || !isSize(value.height)) return null;
    return {
      id: value.id,
      name: typeof value.name === "string" ? value.name.slice(0, 120) : "Image",
      width: value.width,
      height: value.height,
    };
  } catch {
    return null;
  }
};

/** The <img> a drop inserts into a page, with inline styles so it renders with or without Tailwind. */
export const assetImageMarkup = (asset: DraggedAsset) => {
  const width = Math.round(Math.min(asset.width, MAX_INSERTED_WIDTH));
  return (
    `<img src="${assetPath(asset.id)}" alt="${escapeAttribute(asset.name)}" ` +
    `style="display: block; width: ${width}px; max-width: 100%; height: auto">`
  );
};

/** A vector page holding just the image, at its own size scaled to fit the artboard limit. */
export const assetArtboardHtml = (asset: DraggedAsset) => {
  const scale = Math.min(1, MAX_ARTBOARD_SIDE / Math.max(asset.width, asset.height));
  const width = Math.max(16, Math.round(asset.width * scale));
  const height = Math.max(16, Math.round(asset.height * scale));
  return prepareArtboardHtml(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<image href="${assetPath(asset.id)}" width="${width}" height="${height}"/></svg>`,
  );
};
