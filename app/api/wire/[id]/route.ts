import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  composeGenerateSystemPrompt,
  selectWireStylePreset,
  type WireStylePreset,
} from "@/app/lib/wirePrompt";
import {
  normalizeGeneratedHtml,
  parseWireOutput,
  userExplicitlyRequestedImages,
} from "@/app/lib/wireOutput";
import { evaluateWireHtmlQuality } from "@/app/lib/wireQuality";
import {
  DEFAULT_WIRE_MODEL,
  OPENROUTER_FREE_MODELS,
  getWireModelProvider,
  isWireModelName,
  type WireModelName,
} from "@/app/lib/wireModels";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/db/queries/projects";

const OPENROUTER_MODELS = Array.from(new Set(OPENROUTER_FREE_MODELS));
const GEMINI_MODEL_NAME = DEFAULT_WIRE_MODEL;

type WireMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type WireRequestBody = {
  wireId?: string;
  messages?: unknown;
  modelName?: unknown;
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

const insufficientFundsResponse = () =>
  new Response("Can't process request due to insufficient funds.", {
    status: 402,
  });

const selectedModelFailureResponse = ({
  modelName,
  error,
}: {
  modelName: string;
  error: unknown;
}) => {
  if (isInsufficientFunds(error)) {
    return insufficientFundsResponse();
  }

  return new Response(
    `Generation failed with ${modelName}. Try another model.`,
    { status: 502 },
  );
};

const getErrorMessage = (error: unknown) => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const anyError = error as Record<string, unknown>;
    const message =
      (anyError.message as string | undefined) ||
      (anyError.error as { message?: string } | undefined)?.message ||
      (anyError.cause as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const getStatusCode = (error: unknown) => {
  if (!error || typeof error !== "object") return undefined;
  const anyError = error as Record<string, unknown>;
  return (
    (anyError.status as number | undefined) ||
    (anyError.statusCode as number | undefined) ||
    (anyError.response as { status?: number } | undefined)?.status
  );
};

const getErrorBody = (error: unknown) => {
  if (!error || typeof error !== "object") return undefined;
  const anyError = error as Record<string, unknown>;
  return (anyError.response as { body?: unknown } | undefined)?.body;
};

const serializeError = (error: unknown) => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    return JSON.stringify(
      {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: (error as { cause?: unknown }).cause,
      },
      null,
      2,
    );
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
};

const isInsufficientFunds = (error: unknown) => {
  const status = getStatusCode(error);
  if (status === 402) return true;
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("insufficient") ||
    message.includes("fund") ||
    message.includes("payment required") ||
    message.includes("402")
  );
};

const isModelError = (error: unknown) => {
  const status = getStatusCode(error);
  if (status === 404) return true;
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("model") &&
    (message.includes("not found") ||
      message.includes("no endpoints") ||
      message.includes("invalid") ||
      message.includes("404"))
  );
};

const parseMessages = (value: unknown): WireMessage[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((item) => {
      const role = item.role;
      const content = item.content;
      if (
        (role === "system" || role === "user" || role === "assistant") &&
        typeof content === "string"
      ) {
        return { role, content };
      }
      return null;
    })
    .filter((item): item is WireMessage => item !== null);
};

const getLatestUserPrompt = (messages: WireMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return message.content;
    }
  }
  return "";
};

const logQualityTelemetry = ({
  text,
  stylePreset,
  allowImages,
  userPrompt,
  modelName,
}: {
  text: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
  modelName: string;
}) => {
  const parsed = parseWireOutput(text);
  const normalized = normalizeGeneratedHtml(parsed.html, { allowImages });
  const quality = evaluateWireHtmlQuality({
    html: normalized.html,
    allowImages,
    userPrompt,
    stylePresetId: stylePreset.id,
  });

  console.info("[wire] quality_assessment", {
    modelName,
    stylePresetId: stylePreset.id,
    score: quality.score,
    violations: quality.violations.length,
  });
};

const streamWithSelectedModel = async ({
  modelName,
  googleApiKey,
  openrouterApiKey,
  messages,
  systemPrompt,
  stylePreset,
  allowImages,
  userPrompt,
}: {
  modelName: WireModelName;
  googleApiKey: string | undefined;
  openrouterApiKey: string | undefined;
  messages: WireMessage[];
  systemPrompt: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
}) => {
  const providerType = getWireModelProvider(modelName);
  if (!providerType) {
    throw new Error("Unsupported model");
  }

  if (providerType === "gemini") {
    const googleProvider = createGoogleGenerativeAI({ apiKey: googleApiKey });
    return streamText({
      model: googleProvider(modelName),
      messages,
      system: systemPrompt,
      onError: ({ error }) => {
        console.error("[wire] Gemini stream error", {
          modelName,
          status: getStatusCode(error),
          message: getErrorMessage(error),
          responseBody: getErrorBody(error),
          error: serializeError(error),
        });
      },
      onFinish: ({ text }) => {
        logQualityTelemetry({
          text,
          stylePreset,
          allowImages,
          userPrompt,
          modelName,
        });
      },
    });
  }

  if (!openrouterApiKey) {
    throw new Error("Missing OpenRouter API key");
  }

  const openRouterProvider = createOpenRouter({ apiKey: openrouterApiKey });
  return streamText({
    model: openRouterProvider(modelName),
    messages,
    system: systemPrompt,
    onError: ({ error }) => {
      console.error("[wire] OpenRouter stream error", {
        modelName,
        status: getStatusCode(error),
        message: getErrorMessage(error),
        responseBody: getErrorBody(error),
        error: serializeError(error),
      });
    },
    onFinish: ({ text }) => {
      logQualityTelemetry({
        text,
        stylePreset,
        allowImages,
        userPrompt,
        modelName,
      });
    },
  });
};

const streamWithOpenRouter = async ({
  apiKey,
  messages,
  systemPrompt,
  stylePreset,
  allowImages,
  userPrompt,
}: {
  apiKey: string | undefined;
  messages: WireMessage[];
  systemPrompt: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
}) => {
  if (!apiKey) {
    throw new Error("Missing OpenRouter API key");
  }

  const provider = createOpenRouter({ apiKey });
  let lastError: unknown;

  for (const modelName of OPENROUTER_MODELS) {
    try {
      console.info("[wire] OpenRouter attempt", { modelName });
      return streamText({
        model: provider(modelName),
        messages,
        system: systemPrompt,
        onError: ({ error }) => {
          console.error("[wire] OpenRouter stream error", {
            modelName,
            status: getStatusCode(error),
            message: getErrorMessage(error),
            responseBody: getErrorBody(error),
            error: serializeError(error),
          });
        },
        onFinish: ({ text }) => {
          logQualityTelemetry({
            text,
            stylePreset,
            allowImages,
            userPrompt,
            modelName,
          });
        },
      });
    } catch (error) {
      lastError = error;
      console.error("[wire] OpenRouter error", {
        modelName,
        status: getStatusCode(error),
        message: getErrorMessage(error),
      });
      if (isInsufficientFunds(error)) {
        throw error;
      }
      if (!isModelError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("OpenRouter models unavailable");
};

export async function POST(request: Request, context: RouteContext) {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const project = await getProjectForUser(id, sessionUser.id);
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = (await request.json()) as WireRequestBody;
  const requestedModelRaw = body?.modelName;
  if (requestedModelRaw !== undefined && !isWireModelName(requestedModelRaw)) {
    return Response.json({ error: "Unsupported modelName." }, { status: 400 });
  }

  const requestedModelName = isWireModelName(requestedModelRaw)
    ? requestedModelRaw
    : undefined;

  const messages = parseMessages(body?.messages);
  const wireId = id;
  const latestUserPrompt = getLatestUserPrompt(messages);
  const allowImages = userExplicitlyRequestedImages(latestUserPrompt);
  const stylePreset = selectWireStylePreset({
    wireId,
    userPrompt: latestUserPrompt,
  });

  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const googleProvider = createGoogleGenerativeAI({ apiKey: googleApiKey });

  const systemPrompt = composeGenerateSystemPrompt({
    stylePreset,
    allowImages,
    userPrompt: latestUserPrompt,
  });

  console.info("[wire] generation_attempt", {
    stylePresetId: stylePreset.id,
    requestedModelName,
  });

  if (requestedModelName) {
    try {
      const selectedResult = await streamWithSelectedModel({
        modelName: requestedModelName,
        googleApiKey,
        openrouterApiKey,
        messages,
        systemPrompt,
        stylePreset,
        allowImages,
        userPrompt: latestUserPrompt,
      });

      return selectedResult.toDataStreamResponse();
    } catch (error) {
      console.error("[wire] selected model stream error", {
        modelName: requestedModelName,
        status: getStatusCode(error),
        message: getErrorMessage(error),
        responseBody: getErrorBody(error),
        error: serializeError(error),
      });
      return selectedModelFailureResponse({
        modelName: requestedModelName,
        error,
      });
    }
  }

  try {
    const result = streamText({
      model: googleProvider(GEMINI_MODEL_NAME),
      messages,
      system: systemPrompt,
      onError: ({ error }) => {
        console.error("[wire] Gemini stream error", {
          modelName: GEMINI_MODEL_NAME,
          status: getStatusCode(error),
          message: getErrorMessage(error),
          responseBody: getErrorBody(error),
          error: serializeError(error),
        });
      },
      onFinish: ({ text }) => {
        logQualityTelemetry({
          text,
          stylePreset,
          allowImages,
          userPrompt: latestUserPrompt,
          modelName: GEMINI_MODEL_NAME,
        });
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[wire] Gemini error", {
      modelName: GEMINI_MODEL_NAME,
      status: getStatusCode(error),
      message: getErrorMessage(error),
      responseBody: getErrorBody(error),
      error: serializeError(error),
    });

    try {
      const result = await streamWithOpenRouter({
        apiKey: openrouterApiKey,
        messages,
        systemPrompt,
        stylePreset,
        allowImages,
        userPrompt: latestUserPrompt,
      });

      return result.toDataStreamResponse();
    } catch (openRouterError) {
      console.error("[wire] OpenRouter fallback error", {
        status: getStatusCode(openRouterError),
        message: getErrorMessage(openRouterError),
        responseBody: getErrorBody(openRouterError),
        error: serializeError(openRouterError),
      });

      if (isInsufficientFunds(openRouterError)) {
        return insufficientFundsResponse();
      }

      return insufficientFundsResponse();
    }
  }
}
