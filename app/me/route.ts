import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getRequestSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  return NextResponse.json(
    { user },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
