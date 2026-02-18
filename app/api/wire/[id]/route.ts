import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  composeGenerateSystemPrompt,
  selectWireStylePreset,
  type WireStylePreset,
} from "@/app/lib/wirePrompt";
import {
  parseBatchWireOutput,
  parseWireOutput,
  userExplicitlyRequestedImages,
} from "@/app/lib/wireOutput";
import {
  DEFAULT_WIRE_MODEL,
  OPENROUTER_FREE_MODELS,
  getWireModelProvider,
  isWireModelName,
  type WireModelName,
} from "@/app/lib/wireModels";
import { getRequestSessionUser } from "@/lib/auth/session";
import {
  appendConversationMessage,
  getProjectPageForUser,
  getProjectForUser,
} from "@/lib/db/queries/projects";

const OPENROUTER_MODELS = Array.from(new Set(OPENROUTER_FREE_MODELS));
const GEMINI_MODEL_NAME = DEFAULT_WIRE_MODEL;

type WireMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompactHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type WireRequestBody = {
  wireId?: string;
  messages?: unknown;
  modelName?: unknown;
  promptText?: unknown;
  targetPageId?: unknown;
  targetPageTitle?: unknown;
  targetPageHtml?: unknown;
  compactHistory?: unknown;
  variationIndex?: unknown;
  variationCount?: unknown;
  variationThemeHint?: unknown;
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

const parseCompactHistory = (value: unknown): CompactHistoryMessage[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((item) => {
      const role = item.role;
      const content = item.content;
      if ((role === "user" || role === "assistant") && typeof content === "string") {
        const trimmed = content.trim();
        if (!trimmed) return null;
        return { role, content: trimmed };
      }
      return null;
    })
    .filter((item): item is CompactHistoryMessage => item !== null)
    .slice(-12);
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

const parsePromptText = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const parseOptionalString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const buildPageScopedPrompt = ({
  userPrompt,
  targetPageId,
  targetPageTitle,
  targetPageHtml,
}: {
  userPrompt: string;
  targetPageId?: string;
  targetPageTitle?: string;
  targetPageHtml?: string;
}) => {
  if (!targetPageId) return userPrompt;

  const html = targetPageHtml?.trim() ?? "";
  return [
    "Page editing context:",
    `- Target page ID: ${targetPageId}`,
    `- Target page title: ${targetPageTitle || "Untitled Page"}`,
    "- Edit only this target page and return one full HTML document for this page.",
    html ? "Current target page HTML:" : "Current target page HTML is empty.",
    html || "(empty)",
    "",
    "User instruction:",
    userPrompt,
  ].join("\n");
};

const buildModelMessages = ({
  compactHistory,
  fallbackMessages,
  scopedUserPrompt,
  plainUserPrompt,
}: {
  compactHistory: CompactHistoryMessage[];
  fallbackMessages: WireMessage[];
  scopedUserPrompt: string;
  plainUserPrompt: string;
}): WireMessage[] => {
  const baseHistory: WireMessage[] =
    compactHistory.length > 0
      ? compactHistory.map((message) => ({
          role: message.role,
          content: message.content,
        }))
      : fallbackMessages.filter(
          (message) =>
            (message.role === "user" || message.role === "assistant") &&
            message.content.trim().length > 0,
        );

  const normalizedPrompt = plainUserPrompt.trim();
  if (baseHistory.length > 0) {
    const last = baseHistory[baseHistory.length - 1];
    if (last.role === "user" && last.content.trim() === normalizedPrompt) {
      baseHistory.pop();
    }
  }

  return [...baseHistory, { role: "user", content: scopedUserPrompt }];
};

const extractAssistantSummary = (assistantContent: string) => {
  const parsedBatch = parseBatchWireOutput(assistantContent);
  const batchDetails = parsedBatch.details.trim();
  if (batchDetails) {
    return batchDetails.slice(0, 1200);
  }

  const parsedSingle = parseWireOutput(assistantContent);
  const details = parsedSingle.details.trim();
  if (details) {
    return details.slice(0, 1200);
  }

  const stripped = assistantContent
    .replace(/<!doctype html>[\s\S]*$/i, "")
    .replace(/<html[\s\S]*$/i, "")
    .trim();
  if (stripped) {
    return stripped.slice(0, 1200);
  }

  return "Generated updated HTML.";
};

const parseVariationCount = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return 1;
  }
  if (value < 1) return 1;
  if (value > 3) return 3;
  return value;
};

const parseVariationIndex = (value: unknown, variationCount: number) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  if (value < 1) return 1;
  if (value > variationCount) return variationCount;
  return value;
};

const parseVariationThemeHints = (value: string, variationCount: number) => {
  const hints = value
    .split("||")
    .map((hint) => hint.trim())
    .filter(Boolean);

  const fallback = [
    "Editorial minimal layout with restrained monochrome palette and precise typography.",
    "Bold geometric composition with high contrast neon accents and kinetic visual rhythm.",
    "Warm handcrafted aesthetic with organic forms, textured surfaces, and soft tones.",
  ];

  return Array.from({ length: variationCount }, (_, index) => {
    return hints[index] ?? fallback[index] ?? `Design direction ${index + 1}`;
  });
};

const buildVariationPrompt = ({
  variationIndex,
  variationCount,
  variationThemeHint,
}: {
  variationIndex: number;
  variationCount: number;
  variationThemeHint: string;
}) => {
  return [
    "Variation directive:",
    `- This output is variation ${variationIndex} of ${variationCount}.`,
    `- Anchor style direction to this theme hint: ${variationThemeHint}.`,
    "- Make this variation clearly and substantially different from the others in theme, color system, typography choices, spacing rhythm, layout composition, and interaction style.",
    "- Do not produce minor tweaks of the same design. Treat this as a distinct art direction.",
  ].join("\n");
};

const buildBatchVariationPrompt = ({
  variationCount,
  variationThemeHints,
}: {
  variationCount: number;
  variationThemeHints: string[];
}) => {
  const themeHintLines = variationThemeHints
    .map((hint, index) => `- Variation ${index + 1}: ${hint}`)
    .join("\n");

  return [
    "Batch variation directive:",
    "- Ignore prior single-page output formatting rules and follow this batch format strictly.",
    `- Generate ${variationCount} substantially different design variants in a single response.`,
    "- Each variant must be unique in theme, color system, typography, layout composition, and interaction style.",
    "- Do not output minor tweaks of one design.",
    "- Use these theme anchors:",
    themeHintLines,
    "Output format requirements for batch mode:",
    "- Keep DETAILS as short summary text (2 sentences max).",
    `- Then provide exactly ${variationCount} HTML sections named HTML_1:, HTML_2:, ... up to HTML_${variationCount}:`,
    "- Each HTML_n section must contain a complete HTML document starting with <!doctype html>.",
    "- Do not include a plain HTML: section in batch mode.",
  ].join("\n");
};

const logQualityTelemetry = (_: {
  text: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
  modelName: string;
}) => {
  void _;
};

const persistConversationTurn = async ({
  projectId,
  userPrompt,
  assistantSummary,
  targetPageId,
}: {
  projectId: string;
  userPrompt: string;
  assistantSummary: string;
  targetPageId?: string;
}) => {
  try {
    const trimmedPrompt = userPrompt.trim();
    if (trimmedPrompt) {
      await appendConversationMessage({
        projectId,
        role: "user",
        content: trimmedPrompt,
        targetPageId,
      });
    }

    if (assistantSummary.trim()) {
      await appendConversationMessage({
        projectId,
        role: "assistant",
        content: assistantSummary,
        targetPageId,
      });
    }
  } catch (error) {
    console.error("[wire] conversation_persist_failed", error);
  }
};

const streamWithSelectedModel = async ({
  projectId,
  modelName,
  googleApiKey,
  openrouterApiKey,
  messages,
  systemPrompt,
  stylePreset,
  allowImages,
  userPrompt,
  targetPageId,
}: {
  projectId: string;
  modelName: WireModelName;
  googleApiKey: string | undefined;
  openrouterApiKey: string | undefined;
  messages: WireMessage[];
  systemPrompt: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
  targetPageId?: string;
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
        void persistConversationTurn({
          projectId,
          userPrompt,
          assistantSummary: extractAssistantSummary(text),
          targetPageId,
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
      void persistConversationTurn({
        projectId,
        userPrompt,
        assistantSummary: extractAssistantSummary(text),
        targetPageId,
      });
    },
  });
};

const streamWithOpenRouter = async ({
  projectId,
  apiKey,
  messages,
  systemPrompt,
  stylePreset,
  allowImages,
  userPrompt,
  targetPageId,
}: {
  projectId: string;
  apiKey: string | undefined;
  messages: WireMessage[];
  systemPrompt: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
  targetPageId?: string;
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
          void persistConversationTurn({
            projectId,
            userPrompt,
            assistantSummary: extractAssistantSummary(text),
            targetPageId,
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
  const variationCount = parseVariationCount(body.variationCount);
  const variationIndex = parseVariationIndex(body.variationIndex, variationCount);
  const variationThemeHint =
    typeof body.variationThemeHint === "string"
      ? body.variationThemeHint.trim()
      : "";
  const isBatchVariationRequest = variationCount > 1 && variationIndex === undefined;
  const variationThemeHints = parseVariationThemeHints(
    variationThemeHint,
    variationCount,
  );

  const fallbackMessages = parseMessages(body?.messages);
  const compactHistory = parseCompactHistory(body?.compactHistory);
  const promptText = parsePromptText(body?.promptText);
  const latestUserPrompt = promptText || getLatestUserPrompt(fallbackMessages);
  if (!latestUserPrompt) {
    return Response.json({ error: "Missing promptText." }, { status: 400 });
  }

  const rawTargetPageId = parseOptionalString(body?.targetPageId);
  const rawTargetPageTitle = parseOptionalString(body?.targetPageTitle);
  const rawTargetPageHtml = typeof body?.targetPageHtml === "string" ? body.targetPageHtml : "";

  let resolvedTargetPageId: string | null = null;
  let resolvedTargetPageTitle = rawTargetPageTitle;
  let resolvedTargetPageHtml = rawTargetPageHtml;

  if (rawTargetPageId) {
    const targetPage = await getProjectPageForUser({
      projectId: id,
      pageId: rawTargetPageId,
      userId: sessionUser.id,
    });
    if (!targetPage) {
      return Response.json({ error: "Target page not found." }, { status: 404 });
    }
    resolvedTargetPageId = targetPage.id;
    if (!resolvedTargetPageTitle) {
      resolvedTargetPageTitle = targetPage.title;
    }
    if (!resolvedTargetPageHtml) {
      resolvedTargetPageHtml = targetPage.htmlContent;
    }
  }

  const scopedUserPrompt = buildPageScopedPrompt({
    userPrompt: latestUserPrompt,
    targetPageId: isBatchVariationRequest ? undefined : resolvedTargetPageId ?? undefined,
    targetPageTitle: resolvedTargetPageTitle || undefined,
    targetPageHtml: resolvedTargetPageHtml || undefined,
  });

  const messages = buildModelMessages({
    compactHistory,
    fallbackMessages,
    scopedUserPrompt,
    plainUserPrompt: latestUserPrompt,
  });

  const wireId = id;
  const allowImages = userExplicitlyRequestedImages(latestUserPrompt);
  const stylePreset = selectWireStylePreset({
    wireId,
    userPrompt: latestUserPrompt,
  });

  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const googleProvider = createGoogleGenerativeAI({ apiKey: googleApiKey });

  const baseSystemPrompt = composeGenerateSystemPrompt({
    stylePreset,
    allowImages,
    userPrompt: latestUserPrompt,
  });
  const coreSystemPrompt =
    variationCount > 1
      ? `${baseSystemPrompt}\n\n${
          isBatchVariationRequest
            ? buildBatchVariationPrompt({
                variationCount,
                variationThemeHints,
              })
            : buildVariationPrompt({
                variationIndex: variationIndex ?? 1,
                variationCount,
                variationThemeHint:
                  variationThemeHint || `Design direction ${variationIndex ?? 1}`,
              })
        }`
      : baseSystemPrompt;
  const pageScopeDirective =
    resolvedTargetPageId && !isBatchVariationRequest
      ? [
          "Page scope directive:",
          "- Edit only the provided target page context.",
          "- Do not make cross-page changes.",
          "- Return one full HTML document for the target page only.",
        ].join("\n")
      : "";
  const systemPrompt = pageScopeDirective
    ? `${coreSystemPrompt}\n\n${pageScopeDirective}`
    : coreSystemPrompt;

  console.info("[wire] generation_attempt", {
    stylePresetId: stylePreset.id,
    requestedModelName,
    targetPageId: resolvedTargetPageId,
    variationCount,
    variationIndex: variationIndex ?? null,
    batchMode: isBatchVariationRequest,
  });

  if (requestedModelName) {
    try {
      const selectedResult = await streamWithSelectedModel({
        projectId: id,
        modelName: requestedModelName,
        googleApiKey,
        openrouterApiKey,
        messages,
        systemPrompt,
        stylePreset,
        allowImages,
        userPrompt: latestUserPrompt,
        targetPageId: resolvedTargetPageId ?? undefined,
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
        void persistConversationTurn({
          projectId: id,
          userPrompt: latestUserPrompt,
          assistantSummary: extractAssistantSummary(text),
          targetPageId: resolvedTargetPageId ?? undefined,
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
        projectId: id,
        apiKey: openrouterApiKey,
        messages,
        systemPrompt,
        stylePreset,
        allowImages,
        userPrompt: latestUserPrompt,
        targetPageId: resolvedTargetPageId ?? undefined,
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
