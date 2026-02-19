import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import {
  getUserAiSettings,
  updateUserAiSettings,
  type UserAiSettings,
} from "@/lib/db/queries/users";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import {
  WIRE_MODEL_OPTIONS,
  isWireModelName,
  normalizeEnabledWireModels,
  type WireModelName,
} from "@/lib/wireModels";

type UpdateAiSettingsRequestBody = {
  googleApiKey?: unknown;
  clearGoogleApiKey?: unknown;
  enabledModelIds?: unknown;
};

const MAX_GOOGLE_API_KEY_LENGTH = 512;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toAiSettingsResponse = (settings: UserAiSettings) => ({
  hasGoogleApiKey: settings.hasGoogleApiKey,
  enabledModelIds: settings.enabledModelIds,
  models: WIRE_MODEL_OPTIONS.map((model) => ({
    id: model.id,
    label: model.label,
    tier: model.tier,
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

  const parsed = await readJsonBodyWithLimit<unknown>(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  if (!isRecord(parsed.data)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const body = parsed.data as UpdateAiSettingsRequestBody;
  const clearGoogleApiKey =
    body.clearGoogleApiKey === undefined
      ? false
      : body.clearGoogleApiKey === true;

  if (
    body.clearGoogleApiKey !== undefined &&
    typeof body.clearGoogleApiKey !== "boolean"
  ) {
    return NextResponse.json(
      { error: "clearGoogleApiKey must be a boolean." },
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
    enabledModelIds === undefined
  ) {
    return NextResponse.json(
      { error: "No AI settings fields provided." },
      { status: 400 },
    );
  }

  const updated = await updateUserAiSettings({
    userId: sessionUser.id,
    ...(googleApiKey !== undefined ? { googleApiKey } : {}),
    ...(clearGoogleApiKey ? { clearGoogleApiKey } : {}),
    ...(enabledModelIds !== undefined ? { enabledGoogleModels: enabledModelIds } : {}),
  });

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
