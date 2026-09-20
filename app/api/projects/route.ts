import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createProject, listProjectsForUser } from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { getUserAiSettingsForGeneration } from "@/lib/db/queries/users";
import { getKeyForWireModel, getLanguageModel } from "@/lib/wireProviderClient";
import {
  isOpencodeWireModel,
  isWireModelName,
  resolveFastWireModelForStage,
  type WireModelName,
} from "@/lib/wireModels";

const TITLE_MODEL_NAME = "gemini-3.5-flash-lite";

type CreateProjectRequestBody = {
  title?: string | null;
  prompt?: string | null;
  model?: string | null;
};

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

/**
 * Names a project from its opening prompt.
 *
 * Uses the model the user picked, on their own key, so a title costs them the
 * same as any other call and nothing to the maintainer. Falls back through:
 * their key, the server Google key, then a title derived from the prompt text.
 * A missing key is normal, not an error, so only a real failure is logged.
 *
 * opencode models are skipped deliberately. They run on the user's machine, and
 * queueing an agent job that takes tens of seconds to name a project would make
 * project creation feel broken.
 */
const generateProjectTitle = async (
  prompt: string,
  { userId, modelName }: { userId: string; modelName: WireModelName | null },
) => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return "Untitled Project";

  const system =
    "You create concise project titles. Return only one plain text title, 2 to 6 words, no punctuation except apostrophes.";
  const titlePrompt = `Prompt:\n${trimmedPrompt}\n\nShort project title:`;

  const readTitle = (text: string | undefined) =>
    cleanTitle((text ?? "").split("\n")[0] ?? "");

  if (modelName && !isOpencodeWireModel(modelName)) {
    try {
      const keys = await getUserAiSettingsForGeneration(userId);
      // A cheap model from the same provider: a title does not need the good one.
      const fastModel = resolveFastWireModelForStage(modelName);
      if (keys && getKeyForWireModel(fastModel, keys)) {
        const result = await generateText({
          model: getLanguageModel({ modelName: fastModel, ...keys }),
          system,
          prompt: titlePrompt,
        });
        const title = readTitle(result.text);
        if (title) return title;
      }
    } catch (error) {
      logger.error("projects_title_generation_failed", { error });
    }
  }

  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!googleApiKey) {
    return fallbackTitleFromPrompt(trimmedPrompt);
  }

  try {
    const provider = createGoogleGenerativeAI({ apiKey: googleApiKey });
    const result = await generateText({
      model: provider(TITLE_MODEL_NAME),
      system,
      prompt: titlePrompt,
    });

    const title = readTitle(result.text);
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

    const parsed = await readJsonBodyWithLimit<CreateProjectRequestBody>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data;
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const explicitTitle =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : null;
    const requestedModel =
      typeof body.model === "string" && isWireModelName(body.model)
        ? body.model
        : null;
    const title =
      explicitTitle ??
      (await generateProjectTitle(prompt, {
        userId: sessionUser.id,
        modelName: requestedModel,
      }));

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
