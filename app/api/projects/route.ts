import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createProject, listProjectsForUser } from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

const TITLE_MODEL_NAME = "gemini-2.5-flash-lite";

const cleanTitle = (value: string) => {
  const normalized = value
    .replace(/["'`]/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, 60).trim();
};

const fallbackTitleFromPrompt = (prompt: string) => {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .trim();
  if (!cleaned) return "Untitled Project";

  const words = cleaned.split(" ").filter(Boolean).slice(0, 6);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const generateProjectTitle = async (prompt: string) => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return "Untitled Project";

  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!googleApiKey) {
    return fallbackTitleFromPrompt(trimmedPrompt);
  }

  try {
    const provider = createGoogleGenerativeAI({ apiKey: googleApiKey });
    const result = await generateText({
      model: provider(TITLE_MODEL_NAME),
      system:
        "You create concise project titles. Return only one plain text title, 2 to 6 words, no punctuation except apostrophes.",
      prompt: `Prompt:\n${trimmedPrompt}\n\nShort project title:`,
    });

    const firstLine = (result.text ?? "").split("\n")[0] ?? "";
    const title = cleanTitle(firstLine);
    if (!title) return fallbackTitleFromPrompt(trimmedPrompt);
    return title;
  } catch (error) {
    logger.error("projects_title_generation_failed", { error });
    return fallbackTitleFromPrompt(trimmedPrompt);
  }
};

export async function GET() {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const projects = await listProjectsForUser(sessionUser.id);
    return NextResponse.json({ projects });
  } catch (error) {
    logger.error("projects_list_failed", { error });
    return NextResponse.json({ error: "Failed to list projects." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsed = await readJsonBodyWithLimit<{
      title?: unknown;
      prompt?: unknown;
    }>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data;
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const explicitTitle =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : null;
    const title = explicitTitle ?? (await generateProjectTitle(prompt));

    const created = await createProject(sessionUser.id, title);

    return NextResponse.json(
      {
        project: created.project,
        page: created.page,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("projects_create_failed", { error });
    return NextResponse.json({ error: "Failed to create project." }, { status: 500 });
  }
}
