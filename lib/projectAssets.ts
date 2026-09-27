/**
 * Project images: compression before storage, the signed upload link an MCP
 * agent sends a local file to with curl, and inlining for renders that have no
 * origin to load /api/assets/<id> from. Server only.
 *
 * An agent uploads through a link instead of a tool argument so the image
 * bytes never pass through its context as base64.
 */
import { createHmac, timingSafeEqual } from "crypto";
import sharp from "sharp";

import { ASSET_PATHS_IN_HTML } from "@/lib/assetPaths";
import { readCurrentMasterSecret } from "@/lib/security/userApiKeyCrypto";

/** Vercel rejects request bodies over 4.5 MB, so uploads stop short of it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** What one image may take in the database after compression. */
export const MAX_STORED_BYTES = 1.5 * 1024 * 1024;
export const MAX_ASSETS_PER_PROJECT = 30;
/** Longest side kept. Larger photos are scaled down, which a design never shows anyway. */
const MAX_DIMENSION = 2560;
const UPLOAD_TTL_MS = 15 * 60 * 1000;
const ASSET_NAME_MAX_CHARS = 120;

export class AssetRejectedError extends Error {}

const FORMAT_MIME: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/**
 * Makes an upload as small as it can be without visible loss. Graphics with
 * flat color (PNG, GIF) go to lossless WebP, which keeps every pixel. Photos
 * go to WebP at quality 90. The original is kept whenever it is already
 * smaller. Animated images are kept as they are.
 */
export const compressImage = async (input: Buffer) => {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw new AssetRejectedError("The file is not an image Wirely can read.");
  }
  const mimeType = metadata.format ? FORMAT_MIME[metadata.format] : undefined;
  if (!mimeType || !metadata.width || !metadata.height) {
    throw new AssetRejectedError("Upload a PNG, JPEG, WebP, GIF, or AVIF image.");
  }

  const original = { data: input, mimeType, width: metadata.width, height: metadata.height };
  if ((metadata.pages ?? 1) > 1) return original;

  const lossless = metadata.format === "png" || metadata.format === "gif";
  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp(lossless ? { lossless: true, effort: 6 } : { quality: 90, effort: 6 })
    .toBuffer({ resolveWithObject: true });

  const resized = info.width !== metadata.width || info.height !== metadata.height;
  return data.byteLength < input.byteLength || resized
    ? { data, mimeType: "image/webp", width: info.width, height: info.height }
    : original;
};

/** A readable file name, since agents and the sidebar both show it. */
export const cleanAssetName = (name: string | null | undefined) => {
  const cleaned = (name ?? "")
    .replace(/[\u0000-\u001f<>"'`\\/]/g, "")
    .trim()
    .slice(0, ASSET_NAME_MAX_CHARS);
  return cleaned || "image";
};

// Its own key, so an upload signature can never double as a share link.
const uploadKey = (masterSecret: Buffer) =>
  createHmac("sha256", masterSecret).update("wirely-asset-upload-key").digest();

const sign = (projectId: string, userId: string, expiresAt: number, masterSecret: Buffer) =>
  createHmac("sha256", uploadKey(masterSecret))
    .update(`v1:${projectId}:${userId}:${expiresAt}`)
    .digest("base64url");

/** A short lived link that stores one PUT body as an image in the project. */
export const createAssetUploadPath = (
  { projectId, userId }: { projectId: string; userId: string },
  now = Date.now(),
  masterSecret = readCurrentMasterSecret(),
) => {
  const expiresAt = now + UPLOAD_TTL_MS;
  const params = new URLSearchParams({
    project: projectId,
    user: userId,
    exp: String(expiresAt),
    sig: sign(projectId, userId, expiresAt, masterSecret),
  });
  return `/api/assets/upload?${params}`;
};

/** The project and user a link was signed for, or null when it is forged or expired. */
export const verifyAssetUpload = (
  params: URLSearchParams,
  now = Date.now(),
  masterSecret = readCurrentMasterSecret(),
) => {
  const projectId = params.get("project");
  const userId = params.get("user");
  const sig = params.get("sig");
  const expiresAt = Number(params.get("exp"));
  if (!projectId || !userId || !sig || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    return null;
  }
  const expected = Buffer.from(sign(projectId, userId, expiresAt, masterSecret));
  const actual = Buffer.from(sig);
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? { projectId, userId }
    : null;
};

/**
 * Swaps each /api/assets/<id> in a document for a data URL. The headless
 * screenshot loads HTML with no origin, so a relative path would not resolve.
 */
export const inlineAssets = async (
  html: string,
  loadAsset: (assetId: string) => Promise<{ mimeType: string; data: Buffer } | null>,
) => {
  const ids = [
    ...new Set([...html.matchAll(ASSET_PATHS_IN_HTML)].map((match) => match[1].toLowerCase())),
  ];
  if (ids.length === 0) return html;
  const dataUrls = new Map<string, string>();
  for (const id of ids) {
    const asset = await loadAsset(id);
    if (asset) dataUrls.set(id, `data:${asset.mimeType};base64,${asset.data.toString("base64")}`);
  }
  return html.replace(
    ASSET_PATHS_IN_HTML,
    (path, id: string) => dataUrls.get(id.toLowerCase()) ?? path,
  );
};

/**
 * Reads an upload body as bytes, stopping at MAX_UPLOAD_BYTES without
 * buffering the rest. Null when the body is empty or too large.
 */
export const readUploadBody = async (request: Request) => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) return null;
  if (!request.body) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return size > 0 ? Buffer.concat(chunks) : null;
};

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
