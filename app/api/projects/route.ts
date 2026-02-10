import { NextResponse } from "next/server";
import { createProject, listProjectsForUser } from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const projects = await listProjectsForUser(sessionUser.id);
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[projects:list]", error);
    return NextResponse.json({ error: "Failed to list projects." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { title?: unknown };
    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : "Untitled Project";

    const created = await createProject(sessionUser.id, title);

    return NextResponse.json(
      {
        project: created.project,
        page: created.page,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[projects:create]", error);
    return NextResponse.json({ error: "Failed to create project." }, { status: 500 });
  }
}
