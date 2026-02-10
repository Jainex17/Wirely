import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

export async function GET() {
  const { data } = await auth.getSession();
  if (!data?.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const user = {
    id: typeof data.user.id === "string" ? data.user.id : "",
    email: typeof data.user.email === "string" ? data.user.email : null,
    name: typeof data.user.name === "string" ? data.user.name : null,
    avatarUrl: typeof data.user.image === "string" ? data.user.image : null,
  };

  return NextResponse.json(
    { user },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
