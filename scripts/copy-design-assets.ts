/**
 * Copies the design engine's browser assets into public/, where the engine
 * fetches them from the site root: the CanvasKit renderer's wasm and the
 * default Inter fonts. They come from node_modules, so they match the
 * installed engine and stay out of git. Runs before dev and build.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname), "..");
const publicDir = join(root, "public");
mkdirSync(publicDir, { recursive: true });

copyFileSync(join(root, "node_modules/canvaskit-wasm/bin/canvaskit.wasm"), join(publicDir, "canvaskit.wasm"));

const fontsDir = join(root, "node_modules/@open-pencil/core/assets");
for (const file of readdirSync(fontsDir).filter((name) => name.endsWith(".ttf"))) {
  copyFileSync(join(fontsDir, file), join(publicDir, file));
}
