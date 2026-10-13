/**
 * Copies a design screen to the Pages tab as a new HTML page (see
 * lib/design/screenHtml.ts). Its images become project images first, so the
 * page loads them from /api/assets/<id> like an agent's page does.
 */
import type { Editor } from "@open-pencil/core/editor";
import type { SceneNode } from "@open-pencil/scene-graph";
import { assetPath } from "@/lib/assetPaths";
import { SCREEN_SIZES } from "@/lib/design/document";
import { collectImageHashes, screenToHtml } from "@/lib/design/screenHtml";
import { useEditorStore } from "@/store/useEditorStore";

// A project image made from a design image is named after its hash, so
// sending the screen again reuses it instead of filling the project's limit.
const imageAssetName = (hash: string) => `design-${hash.slice(0, 12)}`;

const errorOf = async (response: Response, fallback: string) =>
  ((await response.json().catch(() => null)) as { error?: string } | null)?.error || fallback;

/** Project images for the screen's image fills, by hash. Counts the ones that could not be stored. */
const uploadImages = async (projectId: string, editor: Editor, hashes: string[]) => {
  const urls = new Map<string, string>();
  let failed = 0;
  if (hashes.length === 0) return { urls, failed };
  const listed = await fetch(`/api/projects/${projectId}/assets`, { cache: "no-store" });
  const { assets = [] } = listed.ok ? ((await listed.json()) as { assets?: Array<{ id: string; name: string }> }) : {};
  for (const hash of hashes) {
    const name = imageAssetName(hash);
    const existing = assets.find((asset) => asset.name === name);
    const bytes = editor.graph.images.get(hash);
    if (existing) {
      urls.set(hash, assetPath(existing.id));
      continue;
    }
    if (!bytes) continue;
    const response = await fetch(`/api/projects/${projectId}/assets?name=${encodeURIComponent(name)}`, {
      method: "POST",
      body: new Blob([new Uint8Array(bytes)]),
    });
    const payload = response.ok ? ((await response.json()) as { asset?: { id: string } }) : null;
    if (payload?.asset) urls.set(hash, assetPath(payload.asset.id));
    else failed += 1;
  }
  return { urls, failed };
};

/**
 * Creates the page on the server, then adds it to the Pages tab's store so it
 * shows when the tab opens. Returns how many images were left out.
 */
export const sendScreenToPages = async (projectId: string, editor: Editor, screen: SceneNode) => {
  const { urls, failed } = await uploadImages(projectId, editor, collectImageHashes(editor.graph, screen.id));
  const response = await fetch(`/api/projects/${projectId}/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: screen.name,
      deviceType: screen.width === SCREEN_SIZES.mobile.width ? "mobile" : "desktop",
      htmlContent: screenToHtml(editor.graph, screen.id, urls),
    }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "Could not create the page."));
  const { page } = (await response.json()) as {
    page: { id: string; title: string; htmlContent: string; deviceType: "desktop" | "mobile" };
  };
  const store = useEditorStore.getState();
  store.createPage(page.title, undefined, page.id, page.deviceType);
  store.setPageHtml(page.id, page.htmlContent);
  return { pageId: page.id, imagesLeftOut: failed };
};
