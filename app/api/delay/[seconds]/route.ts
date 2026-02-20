import { NextResponse } from "next/server";

const ALLOWED_SECONDS = new Set([15, 25, 35, 60, 120]);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ seconds: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { seconds } = await params;
  const delaySeconds = Number.parseInt(seconds, 10);

  if (!ALLOWED_SECONDS.has(delaySeconds)) {
    return NextResponse.json({ error: "Invalid delay route." }, { status: 404 });
  }

  const startedAt = Date.now();
  await wait(delaySeconds * 1000);

  return NextResponse.json(
    {
      route: `/${delaySeconds}`,
      delaySeconds,
      durationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
