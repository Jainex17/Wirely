import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import {
  getUserAiSettings,
  updateUserAiSettings,
  type UserAiSettings,
} from "@/lib/db/queries/users";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { isUserApiKeyCryptoError } from "@/lib/security/userApiKeyCrypto";
import {
  WIRE_MODEL_OPTIONS,
  isWireModelName,
  normalizeEnabledWireModels,
  type WireModelName,
} from "@/lib/wireModels";

type UpdateAiSettingsRequestBody = {
  googleApiKey?: string;
  clearGoogleApiKey?: boolean;
  openRouterApiKey?: string;
  clearOpenRouterApiKey?: boolean;
  zaiApiKey?: string;
  clearZaiApiKey?: boolean;
  unsplashApiKey?: string;
  clearUnsplashApiKey?: boolean;
  enabledModelIds?: WireModelName[];
};

const MAX_GOOGLE_API_KEY_LENGTH = 512;
const MAX_OPENROUTER_API_KEY_LENGTH = 512;
const MAX_ZAI_API_KEY_LENGTH = 512;
const MAX_UNSPLASH_API_KEY_LENGTH = 512;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toAiSettingsResponse = (settings: UserAiSettings) => ({
  hasGoogleApiKey: settings.hasGoogleApiKey,
  hasOpenRouterApiKey: settings.hasOpenRouterApiKey,
  hasZaiApiKey: settings.hasZaiApiKey,
  hasUnsplashApiKey: settings.hasUnsplashApiKey,
  enabledModelIds: settings.enabledModelIds,
  models: WIRE_MODEL_OPTIONS.map((model) => ({
    id: model.id,
    label: model.label,
    description: model.description,
    tier: model.tier,
    provider: model.provider,
    enabled: settings.enabledModelIds.includes(model.id),
  })),
});

export async function GET() {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const settings = await getUserAiSettings(sessionUser.id);
  if (!settings) {
    return NextResponse.json(
      { error: "Unable to load AI settings." },
      { status: 500 },
    );
  }

  return NextResponse.json(toAiSettingsResponse(settings), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function PATCH(request: Request) {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = await readJsonBodyWithLimit<UpdateAiSettingsRequestBody>(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  if (!isRecord(parsed.data)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const clearGoogleApiKey =
    body.clearGoogleApiKey === undefined
      ? false
      : body.clearGoogleApiKey === true;
  const clearOpenRouterApiKey =
    body.clearOpenRouterApiKey === undefined
      ? false
      : body.clearOpenRouterApiKey === true;
  const clearZaiApiKey =
    body.clearZaiApiKey === undefined ? false : body.clearZaiApiKey === true;
  const clearUnsplashApiKey =
    body.clearUnsplashApiKey === undefined
      ? false
      : body.clearUnsplashApiKey === true;

  if (
    body.clearGoogleApiKey !== undefined &&
    typeof body.clearGoogleApiKey !== "boolean"
  ) {
    return NextResponse.json(
      { error: "clearGoogleApiKey must be a boolean." },
      { status: 400 },
    );
  }
  if (
    body.clearOpenRouterApiKey !== undefined &&
    typeof body.clearOpenRouterApiKey !== "boolean"
  ) {
    return NextResponse.json(
      { error: "clearOpenRouterApiKey must be a boolean." },
      { status: 400 },
    );
  }
  if (body.clearZaiApiKey !== undefined && typeof body.clearZaiApiKey !== "boolean") {
    return NextResponse.json(
      { error: "clearZaiApiKey must be a boolean." },
      { status: 400 },
    );
  }
  if (
    body.clearUnsplashApiKey !== undefined &&
    typeof body.clearUnsplashApiKey !== "boolean"
  ) {
    return NextResponse.json(
      { error: "clearUnsplashApiKey must be a boolean." },
      { status: 400 },
    );
  }

  let googleApiKey: string | undefined;
  if (body.googleApiKey !== undefined) {
    if (typeof body.googleApiKey !== "string") {
      return NextResponse.json(
        { error: "googleApiKey must be a string." },
        { status: 400 },
      );
    }

    const trimmedKey = body.googleApiKey.trim();
    if (!trimmedKey) {
      return NextResponse.json(
        { error: "googleApiKey cannot be empty." },
        { status: 400 },
      );
    }
    if (trimmedKey.length > MAX_GOOGLE_API_KEY_LENGTH) {
      return NextResponse.json(
        {
          error: `googleApiKey is too long (max ${MAX_GOOGLE_API_KEY_LENGTH} chars).`,
        },
        { status: 400 },
      );
    }
    googleApiKey = trimmedKey;
  }

  if (googleApiKey && clearGoogleApiKey) {
    return NextResponse.json(
      { error: "Provide either googleApiKey or clearGoogleApiKey, not both." },
      { status: 400 },
    );
  }

  let openRouterApiKey: string | undefined;
  if (body.openRouterApiKey !== undefined) {
    if (typeof body.openRouterApiKey !== "string") {
      return NextResponse.json(
        { error: "openRouterApiKey must be a string." },
        { status: 400 },
      );
    }

    const trimmedKey = body.openRouterApiKey.trim();
    if (!trimmedKey) {
      return NextResponse.json(
        { error: "openRouterApiKey cannot be empty." },
        { status: 400 },
      );
    }
    if (trimmedKey.length > MAX_OPENROUTER_API_KEY_LENGTH) {
      return NextResponse.json(
        {
          error: `openRouterApiKey is too long (max ${MAX_OPENROUTER_API_KEY_LENGTH} chars).`,
        },
        { status: 400 },
      );
    }
    openRouterApiKey = trimmedKey;
  }

  if (openRouterApiKey && clearOpenRouterApiKey) {
    return NextResponse.json(
      {
        error:
          "Provide either openRouterApiKey or clearOpenRouterApiKey, not both.",
      },
      { status: 400 },
    );
  }

  let zaiApiKey: string | undefined;
  if (body.zaiApiKey !== undefined) {
    if (typeof body.zaiApiKey !== "string") {
      return NextResponse.json(
        { error: "zaiApiKey must be a string." },
        { status: 400 },
      );
    }

    const trimmedKey = body.zaiApiKey.trim();
    if (!trimmedKey) {
      return NextResponse.json(
        { error: "zaiApiKey cannot be empty." },
        { status: 400 },
      );
    }
    if (trimmedKey.length > MAX_ZAI_API_KEY_LENGTH) {
      return NextResponse.json(
        {
          error: `zaiApiKey is too long (max ${MAX_ZAI_API_KEY_LENGTH} chars).`,
        },
        { status: 400 },
      );
    }
    zaiApiKey = trimmedKey;
  }

  if (zaiApiKey && clearZaiApiKey) {
    return NextResponse.json(
      { error: "Provide either zaiApiKey or clearZaiApiKey, not both." },
      { status: 400 },
    );
  }

  let unsplashApiKey: string | undefined;
  if (body.unsplashApiKey !== undefined) {
    if (typeof body.unsplashApiKey !== "string") {
      return NextResponse.json(
        { error: "unsplashApiKey must be a string." },
        { status: 400 },
      );
    }

    const trimmedKey = body.unsplashApiKey.trim();
    if (!trimmedKey) {
      return NextResponse.json(
        { error: "unsplashApiKey cannot be empty." },
        { status: 400 },
      );
    }
    if (trimmedKey.length > MAX_UNSPLASH_API_KEY_LENGTH) {
      return NextResponse.json(
        {
          error: `unsplashApiKey is too long (max ${MAX_UNSPLASH_API_KEY_LENGTH} chars).`,
        },
        { status: 400 },
      );
    }
    unsplashApiKey = trimmedKey;
  }

  if (unsplashApiKey && clearUnsplashApiKey) {
    return NextResponse.json(
      {
        error:
          "Provide either unsplashApiKey or clearUnsplashApiKey, not both.",
      },
      { status: 400 },
    );
  }

  let enabledModelIds: WireModelName[] | undefined;
  if (body.enabledModelIds !== undefined) {
    if (!Array.isArray(body.enabledModelIds)) {
      return NextResponse.json(
        { error: "enabledModelIds must be an array." },
        { status: 400 },
      );
    }

    const invalidModel = body.enabledModelIds.find(
      (modelName) => !isWireModelName(modelName),
    );
    if (invalidModel !== undefined) {
      return NextResponse.json(
        { error: `Unsupported model id: ${String(invalidModel)}.` },
        { status: 400 },
      );
    }

    enabledModelIds = normalizeEnabledWireModels(body.enabledModelIds);
  }

  if (
    googleApiKey === undefined &&
    !clearGoogleApiKey &&
    openRouterApiKey === undefined &&
    !clearOpenRouterApiKey &&
    zaiApiKey === undefined &&
    !clearZaiApiKey &&
    unsplashApiKey === undefined &&
    !clearUnsplashApiKey &&
    enabledModelIds === undefined
  ) {
    return NextResponse.json(
      { error: "No AI settings fields provided." },
      { status: 400 },
    );
  }

  let updated: UserAiSettings | null = null;
  try {
    updated = await updateUserAiSettings({
      userId: sessionUser.id,
      ...(googleApiKey !== undefined ? { googleApiKey } : {}),
      ...(clearGoogleApiKey ? { clearGoogleApiKey } : {}),
      ...(openRouterApiKey !== undefined ? { openRouterApiKey } : {}),
      ...(clearOpenRouterApiKey ? { clearOpenRouterApiKey } : {}),
      ...(zaiApiKey !== undefined ? { zaiApiKey } : {}),
      ...(clearZaiApiKey ? { clearZaiApiKey } : {}),
      ...(unsplashApiKey !== undefined ? { unsplashApiKey } : {}),
      ...(clearUnsplashApiKey ? { clearUnsplashApiKey } : {}),
      ...(enabledModelIds !== undefined
        ? { enabledGoogleModels: enabledModelIds }
        : {}),
    });
  } catch (error) {
    if (isUserApiKeyCryptoError(error) && error.code === "CRYPTO_CONFIG_ERROR") {
      return NextResponse.json(
        { error: "Server encryption is not configured correctly." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Unable to update AI settings." },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Unable to update AI settings." },
      { status: 500 },
    );
  }

  return NextResponse.json(toAiSettingsResponse(updated), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
