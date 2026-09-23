import { NextResponse } from "next/server";

import { getRequestSessionUser } from "@/lib/auth/session";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/auth/apiToken";
import { isLocalAgentOnline } from "@/lib/db/queries/localAgent";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lists the user's agent tokens and whether an agent is currently connected. */
export async function GET() {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      // The 401 itself is normal for an expired session; the log line is what
      // makes an unexpected spike of these findable in production logs.
      logger.warn("profile.agent_tokens.unauthenticated");
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const [tokens, online] = await Promise.all([
      listApiTokens(sessionUser.id),
      isLocalAgentOnline(sessionUser.id),
    ]);

    return NextResponse.json({ tokens, online }, { status: 200 });
  } catch (error) {
    logger.error("profile.agent_tokens.list_failed", { error });
    return NextResponse.json({ error: "Failed to list tokens." }, { status: 500 });
  }
}

/**
 * Mints a token. The plaintext is in this response and nowhere else: only its
 * SHA-256 hash is stored, so it cannot be shown again.
 */
export async function POST(request: Request) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      logger.warn("profile.agent_tokens.unauthenticated");
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsed = await readJsonBodyWithLimit<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const nameValue = parsed.data.name;
    const name =
      typeof nameValue === "string" && nameValue.trim()
        ? nameValue.trim().slice(0, 80)
        : "Local agent";

    const created = await createApiToken(sessionUser.id, name);
    return NextResponse.json({ token: created }, { status: 201 });
  } catch (error) {
    logger.error("profile.agent_tokens.create_failed", { error });
    return NextResponse.json({ error: "Failed to create a token." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      logger.warn("profile.agent_tokens.unauthenticated");
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsed = await readJsonBodyWithLimit<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const tokenId = parsed.data.tokenId;
    if (typeof tokenId !== "string" || !tokenId) {
      return NextResponse.json({ error: "`tokenId` is required." }, { status: 400 });
    }

    const revoked = await revokeApiToken(sessionUser.id, tokenId);
    if (!revoked) {
      return NextResponse.json({ error: "Token not found." }, { status: 404 });
    }

    return NextResponse.json({ revoked: true }, { status: 200 });
  } catch (error) {
    logger.error("profile.agent_tokens.revoke_failed", { error });
    return NextResponse.json({ error: "Failed to revoke the token." }, { status: 500 });
  }
}
