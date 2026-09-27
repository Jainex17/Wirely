import { and, asc, count, eq, getTableColumns } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { projectAssets, projects } from "@/lib/db/schema";
import {
  AssetRejectedError,
  cleanAssetName,
  compressImage,
  MAX_ASSETS_PER_PROJECT,
  MAX_STORED_BYTES,
} from "@/lib/projectAssets";

// Everything but the bytes, for lists.
const { data: _data, ...assetSummaryColumns } = getTableColumns(projectAssets);
void _data;

export type ProjectAssetSummary = Omit<typeof projectAssets.$inferSelect, "data">;

export const listProjectAssetsForUser = async (projectId: string, userId: string) =>
  getDb()
    .select(assetSummaryColumns)
    .from(projectAssets)
    .innerJoin(projects, eq(projects.id, projectAssets.projectId))
    .where(and(eq(projectAssets.projectId, projectId), eq(projects.userId, userId)))
    .orderBy(asc(projectAssets.createdAt));

/**
 * Compresses and stores an upload for a project the user owns. Throws
 * AssetRejectedError with a message fit to show when the image cannot go in.
 */
export const saveProjectAsset = async ({
  projectId,
  userId,
  name,
  bytes,
}: {
  projectId: string;
  userId: string;
  name: string | null;
  bytes: Buffer;
}): Promise<ProjectAssetSummary | null> => {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) return null;

  // ponytail: count then insert can race past the cap by a request or two; a
  // trigger would close it if abuse ever shows up.
  const [{ total }] = await db
    .select({ total: count() })
    .from(projectAssets)
    .where(eq(projectAssets.projectId, projectId));
  if (total >= MAX_ASSETS_PER_PROJECT) {
    throw new AssetRejectedError(
      `A project holds up to ${MAX_ASSETS_PER_PROJECT} images. Delete one to add another.`,
    );
  }

  const image = await compressImage(bytes);
  if (image.data.byteLength > MAX_STORED_BYTES) {
    throw new AssetRejectedError(
      "The image is still over 1.5 MB after compression. Resize it to at most 2560 px and try again.",
    );
  }

  const [asset] = await db
    .insert(projectAssets)
    .values({
      projectId,
      name: cleanAssetName(name),
      mimeType: image.mimeType,
      byteSize: image.data.byteLength,
      width: image.width,
      height: image.height,
      data: image.data,
    })
    .returning(assetSummaryColumns);
  return asset ?? null;
};

export const deleteProjectAssetForUser = async ({
  projectId,
  assetId,
  userId,
}: {
  projectId: string;
  assetId: string;
  userId: string;
}) => {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) return false;
  const deleted = await db
    .delete(projectAssets)
    .where(and(eq(projectAssets.id, assetId), eq(projectAssets.projectId, projectId)))
    .returning({ id: projectAssets.id });
  return deleted.length > 0;
};

/** The bytes behind /api/assets/<id>. The id is unguessable, which is the access check. */
export const getAssetData = async (assetId: string) => {
  const [asset] = await getDb()
    .select({ mimeType: projectAssets.mimeType, data: projectAssets.data })
    .from(projectAssets)
    .where(eq(projectAssets.id, assetId))
    .limit(1);
  return asset ?? null;
};
