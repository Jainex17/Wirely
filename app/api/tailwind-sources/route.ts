import { readFile } from "node:fs/promises";
import path from "node:path";
import { TAILWIND_SOURCE_FILES } from "@/lib/tailwindFrame";

// Read once at build and served as a static file: the stylesheets are the
// installed tailwindcss package's, public, and the same for every user.
export const dynamic = "force-static";

/** Tailwind's own stylesheets, which the editor compiles each canvas frame's CSS from. */
export async function GET() {
  const directory = path.join(process.cwd(), "node_modules", "tailwindcss");
  const entries = await Promise.all(
    TAILWIND_SOURCE_FILES.map(async (file) => [file, await readFile(path.join(directory, file), "utf8")]),
  );
  return Response.json(Object.fromEntries(entries), {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
