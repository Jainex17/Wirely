import { generateText, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  composeGenerateSystemPrompt,
  composeRepairSystemPrompt,
  getWireStylePresetById,
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

type WireRequestMode = "generate" | "repair";

type WireQualityContext = {
  stylePresetId?: string;
  violations?: string[];
};

type WireRequestBody = {
  wireId?: string;
  messages?: unknown;
  mode?: WireRequestMode;
  draftHtml?: string;
  qualityContext?: WireQualityContext;
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

const parseMode = (value: unknown): WireRequestMode =>
  value === "repair" ? "repair" : "generate";

const parseQualityContext = (value: unknown): WireQualityContext => {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const stylePresetId =
    typeof record.stylePresetId === "string" ? record.stylePresetId : undefined;
  const violations = Array.isArray(record.violations)
    ? record.violations.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : undefined;

  return { stylePresetId, violations };
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

const buildRepairContent = (html: string, details: string) =>
  `DETAILS:\n${details}\n\nHTML:\n${html}`;

const buildRepairPrompt = ({
  userPrompt,
  draftHtml,
  violations,
}: {
  userPrompt: string;
  draftHtml: string;
  violations: string[];
}) => {
  const violationsBlock =
    violations.length > 0
      ? violations.map((item) => `- ${item}`).join("\n")
      : "- improve_structure_and_quality";

  return [
    "User request:",
    userPrompt || "(no explicit user prompt available)",
    "",
    "Violations to fix:",
    violationsBlock,
    "",
    "Draft HTML to repair:",
    draftHtml,
  ].join("\n");
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

  console.info("[wire] quality_score", {
    modelName,
    stylePresetId: stylePreset.id,
    score: quality.score,
    violation_count: quality.violations.length,
    needs_repair: quality.needsRepair,
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

const generateWithSelectedModel = async ({
  modelName,
  googleApiKey,
  openrouterApiKey,
  systemPrompt,
  prompt,
}: {
  modelName: WireModelName;
  googleApiKey: string | undefined;
  openrouterApiKey: string | undefined;
  systemPrompt: string;
  prompt: string;
}) => {
  const providerType = getWireModelProvider(modelName);
  if (!providerType) {
    throw new Error("Unsupported model");
  }

  if (providerType === "gemini") {
    const googleProvider = createGoogleGenerativeAI({ apiKey: googleApiKey });
    const result = await generateText({
      model: googleProvider(modelName),
      system: systemPrompt,
      prompt,
    });
    return { text: result.text, modelName };
  }

  if (!openrouterApiKey) {
    throw new Error("Missing OpenRouter API key");
  }

  const openRouterProvider = createOpenRouter({ apiKey: openrouterApiKey });
  const result = await generateText({
    model: openRouterProvider(modelName),
    system: systemPrompt,
    prompt,
  });
  return { text: result.text, modelName };
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

const generateWithOpenRouter = async ({
  apiKey,
  systemPrompt,
  prompt,
}: {
  apiKey: string | undefined;
  systemPrompt: string;
  prompt: string;
}) => {
  if (!apiKey) {
    throw new Error("Missing OpenRouter API key");
  }

  const provider = createOpenRouter({ apiKey });
  let lastError: unknown;

  for (const modelName of OPENROUTER_MODELS) {
    try {
      console.info("[wire] OpenRouter repair attempt", { modelName });
      const result = await generateText({
        model: provider(modelName),
        system: systemPrompt,
        prompt,
      });

      return { text: result.text, modelName };
    } catch (error) {
      lastError = error;
      console.error("[wire] OpenRouter repair error", {
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

  throw lastError ?? new Error("OpenRouter repair models unavailable");
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
  const mode = parseMode(body?.mode);
  const wireId = id;
  const latestUserPrompt = getLatestUserPrompt(messages);
  const allowImages = userExplicitlyRequestedImages(latestUserPrompt);
  const qualityContext = parseQualityContext(body?.qualityContext);

  const defaultStylePreset = selectWireStylePreset({
    wireId,
    userPrompt: latestUserPrompt,
  });
  const stylePreset =
    getWireStylePresetById(qualityContext.stylePresetId) ?? defaultStylePreset;

  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const googleProvider = createGoogleGenerativeAI({ apiKey: googleApiKey });

  if (mode === "repair") {
    const draftHtml = typeof body?.draftHtml === "string" ? body.draftHtml : "";
    if (!draftHtml.trim()) {
      return Response.json(
        { error: "Missing draftHtml for repair mode." },
        { status: 400 },
      );
    }

    const normalizedDraft = normalizeGeneratedHtml(draftHtml, { allowImages });
    const mergedViolations = Array.from(
      new Set([
        ...normalizedDraft.violations,
        ...(qualityContext.violations ?? []),
      ]),
    );

    console.info("[wire] repair_invoked", {
      mode,
      stylePresetId: stylePreset.id,
      violation_count: mergedViolations.length,
      requestedModelName,
    });

    const repairSystemPrompt = composeRepairSystemPrompt({
      stylePreset,
      allowImages,
      violations: mergedViolations,
    });
    const repairPrompt = buildRepairPrompt({
      userPrompt: latestUserPrompt,
      draftHtml: normalizedDraft.html,
      violations: mergedViolations,
    });

    if (requestedModelName) {
      try {
        const strictResult = await generateWithSelectedModel({
          modelName: requestedModelName,
          googleApiKey,
          openrouterApiKey,
          systemPrompt: repairSystemPrompt,
          prompt: repairPrompt,
        });

        return Response.json({
          content: strictResult.text,
          modelName: strictResult.modelName,
          stylePresetId: stylePreset.id,
          fallbackUsed: false,
        });
      } catch (error) {
        console.error("[wire] selected model repair error", {
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
      const result = await generateText({
        model: googleProvider(GEMINI_MODEL_NAME),
        system: repairSystemPrompt,
        prompt: repairPrompt,
      });

      console.info("[wire] repair_success", {
        modelName: GEMINI_MODEL_NAME,
        stylePresetId: stylePreset.id,
      });

      return Response.json({
        content: result.text,
        modelName: GEMINI_MODEL_NAME,
        stylePresetId: stylePreset.id,
        fallbackUsed: false,
      });
    } catch (error) {
      console.error("[wire] Gemini repair error", {
        modelName: GEMINI_MODEL_NAME,
        status: getStatusCode(error),
        message: getErrorMessage(error),
        responseBody: getErrorBody(error),
        error: serializeError(error),
      });

      try {
        const openRouterResult = await generateWithOpenRouter({
          apiKey: openrouterApiKey,
          systemPrompt: repairSystemPrompt,
          prompt: repairPrompt,
        });

        console.info("[wire] repair_success", {
          modelName: openRouterResult.modelName,
          stylePresetId: stylePreset.id,
        });

        return Response.json({
          content: openRouterResult.text,
          modelName: openRouterResult.modelName,
          stylePresetId: stylePreset.id,
          fallbackUsed: false,
        });
      } catch (repairError) {
        console.error("[wire] repair_fallback", {
          status: getStatusCode(repairError),
          message: getErrorMessage(repairError),
          fallback_used: true,
        });

        return Response.json({
          content: buildRepairContent(
            normalizedDraft.html,
            "Polished the draft with deterministic safeguards after repair fallback.",
          ),
          modelName: "fallback-normalizer",
          stylePresetId: stylePreset.id,
          fallbackUsed: true,
        });
      }
    }
  }

  const systemPrompt = composeGenerateSystemPrompt({
    stylePreset,
    allowImages,
    userPrompt: latestUserPrompt,
  });

  console.info("[wire] generation_attempt", {
    mode,
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
