import { NextResponse } from "next/server";

import { authenticateAgentRequest } from "@/lib/auth/apiToken";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { saveLocalModelCatalog } from "@/lib/db/queries/localAgent";
import { logger } from "@/lib/logger";
import { normalizeDiscoveredLocalModels } from "@/lib/wireModels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Where the local agent reports the model ids its opencode offers.
 *
 * The agent runs `opencode models` on the user's machine at startup and posts
 * the result; the catalog is then merged into the composer's local group. The
 * body is bounded and every entry re-validated here — the list is user-owned
 * data, but it still passes through the boundary as untrusted.
 */
export async function POST(request: Request) {
  try {
    const user = await authenticateAgentRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsed = await readJsonBodyWithLimit<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const models = normalizeDiscoveredLocalModels(parsed.data.models);
    if (models.length === 0) {
      return NextResponse.json(
        { error: "No valid models in the request." },
        { status: 400 },
      );
    }

    const saved = await saveLocalModelCatalog(user.id, models);
    if (!saved) {
      return NextResponse.json(
        { error: "Model catalog storage is not available." },
        { status: 503 },
      );
    }

    return NextResponse.json({ saved: models.length }, { status: 200 });
  } catch (error) {
    logger.error("agent.models_failed", { error });
    return NextResponse.json(
      { error: "Failed to save the model catalog." },
      { status: 500 },
    );
  }
}
