import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { updateUserProfileDetails } from "@/lib/db/queries/users";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";

type UpdateProfileDetailsRequestBody = {
  name?: string | null;
};

const MAX_NAME_LENGTH = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export async function PATCH(request: Request) {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = await readJsonBodyWithLimit<UpdateProfileDetailsRequestBody>(request);
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
  if (typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name must be a string." },
      { status: 400 },
    );
  }

  const trimmedName = body.name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `name is too long (max ${MAX_NAME_LENGTH} chars).` },
      { status: 400 },
    );
  }

  const updated = await updateUserProfileDetails({
    userId: sessionUser.id,
    name: trimmedName.length > 0 ? trimmedName : null,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Unable to update profile details." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      name: updated.name,
      email: updated.email,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
