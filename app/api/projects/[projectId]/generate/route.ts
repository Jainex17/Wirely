import { NextResponse } from "next/server";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const project = await getProjectForUser(projectId, sessionUser.id);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const parsed = await readJsonBodyWithLimit<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const requestBody = parsed.data;
    const proxyResponse = await fetch(new URL(`/api/wire/${projectId}`, request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(request.headers.get("authorization")
          ? { authorization: request.headers.get("authorization") as string }
          : {}),
        ...(request.headers.get("cookie")
          ? { cookie: request.headers.get("cookie") as string }
          : {}),
      },
      body: JSON.stringify({
        ...requestBody,
        wireId: projectId,
      }),
      cache: "no-store",
    });

    const headers = new Headers(proxyResponse.headers);
    headers.delete("content-length");

    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      headers,
    });
  } catch (error) {
    logger.error("projects_generate_proxy_failed", { error });
    return NextResponse.json({ error: "Failed to generate output." }, { status: 500 });
  }
}
