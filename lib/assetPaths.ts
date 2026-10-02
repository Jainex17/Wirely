/**
 * Where a project image is served. Pages reference it by this relative path,
 * which a sandboxed srcdoc frame resolves against the editor's own origin, so
 * the same HTML works on localhost and in production. Client safe.
 */
export const ASSET_PATH_PREFIX = "/api/assets/";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const ASSET_PATH_PATTERN = new RegExp(`^${ASSET_PATH_PREFIX}(${UUID})$`, "i");

/** Every asset path in a document, for inlining them where there is no origin. */
export const ASSET_PATHS_IN_HTML = new RegExp(`${ASSET_PATH_PREFIX}(${UUID})`, "gi");

export const assetPath = (assetId: string) => `${ASSET_PATH_PREFIX}${assetId}`;
