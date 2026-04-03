import { createDataStreamResponse, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  buildFallbackCritiqueReport,
  hasCriticalQualityViolations,
  isAcceptedGeneratedOutput,
  normalizeCritiqueReport,
  shouldRepairGeneratedOutput,
} from "@/lib/wireCritique";
import {
  createGenerationOutputs,
  createGenerationRun,
  updateGenerationOutput,
  updateGenerationRun,
} from "@/lib/db/queries/generationRuns";
import {
  appendConversationMessage,
  getProjectForUser,
  listProjectPagesForUser,
  updateProjectPageForUser,
} from "@/lib/db/queries/projects";
import { getUserAiSettingsForGeneration } from "@/lib/db/queries/users";
import {
  buildAssistantContent,
  composeCritiquePrompt,
  composeDesignBriefPrompt,
  composePageEditSystemPrompt,
  composePlannedGenerateSystemPrompt,
  composeRepairPrompt,
  resolveStylePresetForPlan,
  buildFallbackDesignBrief,
} from "@/lib/wireGenerationPrompts";
import { buildFallbackDesignPlan } from "@/lib/wireFallbackPlan";
import { mapPlanOutputsToTargets, runWithConcurrency } from "@/lib/wireGenerationOrchestrator";
import { type GenerationMode } from "@/lib/wireGenerationTypes";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import {
  evaluateWireHtmlQuality,
  type WireQualityReport,
} from "@/lib/wireQuality";
import {
  isGoogleWireModel,
  isOpenRouterWireModel,
  isZaiWireModel,
  isWireModelName,
  type WireModelName,
} from "@/lib/wireModels";
import {
  normalizeGeneratedHtml,
  parseWireOutput,
  summarizeAssistantDetails,
} from "@/lib/wireOutput";
import { getRequestSessionUser } from "@/lib/auth/session";
import { createRateLimiter } from "@/lib/rate-limit";
import { isUserApiKeyCryptoError } from "@/lib/security/userApiKeyCrypto";
import { selectWireStylePreset } from "@/lib/wirePrompt";
import {
  ensurePlannedStockImageSlots,
  findMissingStockImageSlotIds,
  injectStockImageMetadata,
  removeStockSlotAttributes,
  resolveStockImagesInHtml,
} from "@/lib/stockImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const wireRateLimiter = createRateLimiter();
const includeErrorStack = process.env.NODE_ENV !== "production";
const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4/";

type WireMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompactHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type WireRequestBody = {
  wireId?: unknown;
  messages?: unknown;
  modelName?: unknown;
  promptText?: unknown;
  targetPageId?: unknown;
  targetPageIds?: unknown;
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

const MAX_PROMPT_TEXT_LENGTH = 12_000;
const MAX_MESSAGE_COUNT = 60;
const MAX_MESSAGE_CONTENT_LENGTH = 12_000;
const MAX_COMPACT_HISTORY_COUNT = 24;
const MAX_TARGET_PAGE_ID_LENGTH = 128;
const MAX_TARGET_PAGE_TITLE_LENGTH = 200;
const MAX_TARGET_PAGE_HTML_LENGTH = 250_000;
const MAX_TARGET_PAGE_BATCH_COUNT = 3;
const MAX_VARIATION_THEME_HINT_LENGTH = 2_000;
const MIN_FALLBACK_ACCEPTANCE_SCORE = 68;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isIntegerInRange = (
  value: unknown,
  min: number,
  max: number,
): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

const validateRequestBody = (body: WireRequestBody) => {
  if (body.wireId !== undefined) {
    if (typeof body.wireId !== "string") {
      return "wireId must be a string.";
    }
    if (body.wireId.length > MAX_TARGET_PAGE_ID_LENGTH) {
      return `wireId is too long (max ${MAX_TARGET_PAGE_ID_LENGTH} chars).`;
    }
  }

  if (body.modelName !== undefined && typeof body.modelName !== "string") {
    return "modelName must be a string.";
  }

  if (body.promptText !== undefined) {
    if (typeof body.promptText !== "string") {
      return "promptText must be a string.";
    }
    if (body.promptText.length > MAX_PROMPT_TEXT_LENGTH) {
      return `promptText is too long (max ${MAX_PROMPT_TEXT_LENGTH} chars).`;
    }
  }

  if (body.targetPageId !== undefined) {
    if (typeof body.targetPageId !== "string") {
      return "targetPageId must be a string.";
    }
    if (body.targetPageId.length > MAX_TARGET_PAGE_ID_LENGTH) {
      return `targetPageId is too long (max ${MAX_TARGET_PAGE_ID_LENGTH} chars).`;
    }
  }

  if (body.targetPageIds !== undefined) {
    if (!Array.isArray(body.targetPageIds)) {
      return "targetPageIds must be an array.";
    }
    if (body.targetPageIds.length === 0 || body.targetPageIds.length > MAX_TARGET_PAGE_BATCH_COUNT) {
      return `targetPageIds must have between 1 and ${MAX_TARGET_PAGE_BATCH_COUNT} items.`;
    }
    for (const [index, pageId] of body.targetPageIds.entries()) {
      if (typeof pageId !== "string") {
        return `targetPageIds[${index}] must be a string.`;
      }
      if (pageId.length > MAX_TARGET_PAGE_ID_LENGTH) {
        return `targetPageIds[${index}] is too long (max ${MAX_TARGET_PAGE_ID_LENGTH} chars).`;
      }
    }
  }

  if (body.targetPageTitle !== undefined) {
    if (typeof body.targetPageTitle !== "string") {
      return "targetPageTitle must be a string.";
    }
    if (body.targetPageTitle.length > MAX_TARGET_PAGE_TITLE_LENGTH) {
      return `targetPageTitle is too long (max ${MAX_TARGET_PAGE_TITLE_LENGTH} chars).`;
    }
  }

  if (body.targetPageHtml !== undefined) {
    if (typeof body.targetPageHtml !== "string") {
      return "targetPageHtml must be a string.";
    }
    if (body.targetPageHtml.length > MAX_TARGET_PAGE_HTML_LENGTH) {
      return `targetPageHtml is too long (max ${MAX_TARGET_PAGE_HTML_LENGTH} chars).`;
    }
  }

  if (body.messages !== undefined) {
    if (!Array.isArray(body.messages)) {
      return "messages must be an array.";
    }
    if (body.messages.length > MAX_MESSAGE_COUNT) {
      return `messages must have at most ${MAX_MESSAGE_COUNT} items.`;
    }
    for (const [index, message] of body.messages.entries()) {
      if (!isRecord(message)) {
        return `messages[${index}] must be an object.`;
      }
      if (
        message.role !== "system" &&
        message.role !== "user" &&
        message.role !== "assistant"
      ) {
        return `messages[${index}].role is invalid.`;
      }
      if (typeof message.content !== "string") {
        return `messages[${index}].content must be a string.`;
      }
      if (message.content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        return `messages[${index}].content is too long (max ${MAX_MESSAGE_CONTENT_LENGTH} chars).`;
      }
    }
  }

  if (body.compactHistory !== undefined) {
    if (!Array.isArray(body.compactHistory)) {
      return "compactHistory must be an array.";
    }
    if (body.compactHistory.length > MAX_COMPACT_HISTORY_COUNT) {
      return `compactHistory must have at most ${MAX_COMPACT_HISTORY_COUNT} items.`;
    }
    for (const [index, message] of body.compactHistory.entries()) {
      if (!isRecord(message)) {
        return `compactHistory[${index}] must be an object.`;
      }
      if (message.role !== "user" && message.role !== "assistant") {
        return `compactHistory[${index}].role is invalid.`;
      }
      if (typeof message.content !== "string") {
        return `compactHistory[${index}].content must be a string.`;
      }
      if (message.content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        return `compactHistory[${index}].content is too long (max ${MAX_MESSAGE_CONTENT_LENGTH} chars).`;
      }
    }
  }

  if (body.variationCount !== undefined && !isIntegerInRange(body.variationCount, 1, 3)) {
    return "variationCount must be an integer between 1 and 3.";
  }

  if (body.variationIndex !== undefined) {
    const maxVariationIndex = isIntegerInRange(body.variationCount, 1, 3)
      ? body.variationCount
      : 3;
    if (!isIntegerInRange(body.variationIndex, 1, maxVariationIndex)) {
      return `variationIndex must be an integer between 1 and ${maxVariationIndex}.`;
    }
  }

  if (body.variationThemeHint !== undefined) {
    if (typeof body.variationThemeHint !== "string") {
      return "variationThemeHint must be a string.";
    }
    if (body.variationThemeHint.length > MAX_VARIATION_THEME_HINT_LENGTH) {
      return `variationThemeHint is too long (max ${MAX_VARIATION_THEME_HINT_LENGTH} chars).`;
    }
  }

  return null;
};

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
};

const withRateLimitHeaders = (response: Response, headers: Record<string, string>) => {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
};

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
        ...(includeErrorStack ? { stack: error.stack } : {}),
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

const parseMessages = (value: unknown): WireMessage[] => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_MESSAGE_COUNT)
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
        return { role, content: content.slice(0, MAX_MESSAGE_CONTENT_LENGTH) };
      }
      return null;
    })
    .filter((item): item is WireMessage => item !== null);
};

const parseCompactHistory = (value: unknown): CompactHistoryMessage[] => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_COMPACT_HISTORY_COUNT)
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((item) => {
      const role = item.role;
      const content = item.content;
      if ((role === "user" || role === "assistant") && typeof content === "string") {
        const trimmed = content.trim().slice(0, MAX_MESSAGE_CONTENT_LENGTH);
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
  return value.trim().slice(0, MAX_PROMPT_TEXT_LENGTH);
};

const parseOptionalString = (value: unknown, maxLength = MAX_TARGET_PAGE_TITLE_LENGTH) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const parseVariationCount = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return 1;
  }
  if (value < 1) return 1;
  if (value > 3) return 3;
  return value;
};

const parseTargetPageIds = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((pageId): pageId is string => typeof pageId === "string")
        .map((pageId) => pageId.trim().slice(0, MAX_TARGET_PAGE_ID_LENGTH))
        .filter(Boolean)
    : [];

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

const extractAssistantSummary = (assistantContent: string) => {
  return summarizeAssistantDetails({ content: assistantContent }).slice(0, 1200);
};

const persistConversationTurn = async ({
  projectId,
  userPrompt,
  assistantSummary,
  targetPageId,
  selectedModelName,
  plannerModelName,
  criticModelName,
}: {
  projectId: string;
  userPrompt: string;
  assistantSummary: string;
  targetPageId?: string;
  selectedModelName: string;
  plannerModelName: string;
  criticModelName: string;
}) => {
  try {
    const trimmedPrompt = userPrompt.trim();
    if (trimmedPrompt) {
      await appendConversationMessage({
        projectId,
        role: "user",
        content: trimmedPrompt,
        targetPageId,
        selectedModelName,
        plannerModelName,
        criticModelName,
      });
    }

    if (assistantSummary.trim()) {
      await appendConversationMessage({
        projectId,
        role: "assistant",
        content: assistantSummary,
        targetPageId,
        selectedModelName,
        plannerModelName,
        criticModelName,
      });
    }
  } catch (error) {
    logger.error("wire_conversation_persist_failed", { error });
  }
};

const getLanguageModel = ({
  modelName,
  googleApiKey,
  openRouterApiKey,
  zaiApiKey,
}: {
  modelName: WireModelName;
  googleApiKey?: string | null;
  openRouterApiKey?: string | null;
  zaiApiKey?: string | null;
}) => {
  if (isGoogleWireModel(modelName)) {
    const provider = createGoogleGenerativeAI({ apiKey: googleApiKey as string });
    return provider(modelName);
  }

  if (isZaiWireModel(modelName)) {
    const provider = createOpenAI({
      apiKey: zaiApiKey as string,
      baseURL: ZAI_BASE_URL,
    });
    return provider.chat(modelName);
  }

  const provider = createOpenRouter({ apiKey: openRouterApiKey as string });
  return provider(modelName);
};

const createAssistantResponse = (content: string) =>
  createDataStreamResponse({
    headers: {
      "cache-control": "no-store, no-transform",
    },
    execute: async (dataStream) => {
      dataStream.write(`f:${JSON.stringify({ messageId: crypto.randomUUID() })}\n`);
      dataStream.write(`0:${JSON.stringify(content)}\n`);
      dataStream.write(`d:${JSON.stringify({ finishReason: "stop" })}\n`);
      dataStream.write(
        `e:${JSON.stringify({ finishReason: "stop", isContinued: false })}\n`,
      );
    },
  });

const shouldApplyPlannedTitle = ({
  planMode,
  currentTitle,
  currentHtml,
}: {
  planMode: GenerationMode;
  currentTitle: string;
  currentHtml: string;
}) => {
  if (planMode !== "single_page") return true;
  if (!currentHtml.trim()) return true;
  return /^page\s+\d+$/i.test(currentTitle.trim());
};

const buildQualitySnapshot = ({
  html,
  allowImages,
  userPrompt,
  stylePresetId,
  plannedImageSlots,
  enforcePlannedImageSlots = true,
}: {
  html: string;
  allowImages: boolean;
  userPrompt: string;
  stylePresetId: string;
  plannedImageSlots?: Array<{ id: string }>;
  enforcePlannedImageSlots?: boolean;
}): WireQualityReport => {
  const baseReport = evaluateWireHtmlQuality({
    html,
    allowImages,
    userPrompt,
    stylePresetId,
  });

  if (
    !enforcePlannedImageSlots ||
    !allowImages ||
    !plannedImageSlots ||
    plannedImageSlots.length === 0
  ) {
    return baseReport;
  }

  const missingSlotIds = findMissingStockImageSlotIds({
    html,
    slots: plannedImageSlots,
  });
  if (missingSlotIds.length === 0) {
    return baseReport;
  }

  return {
    ...baseReport,
    score: Math.max(0, baseReport.score - Math.min(36, missingSlotIds.length * 18)),
    violations: Array.from(
      new Set([...baseReport.violations, "missing_planned_stock_image_slot"]),
    ),
  };
};

const generateDesignBrief = async ({
  modelName,
  googleApiKey,
  openRouterApiKey,
  zaiApiKey,
  userPrompt,
  compactHistory,
  requestedOutputCount,
  targetPages,
  forceSinglePage,
  projectId,
}: {
  modelName: WireModelName;
  googleApiKey?: string | null;
  openRouterApiKey?: string | null;
  zaiApiKey?: string | null;
  userPrompt: string;
  compactHistory: CompactHistoryMessage[];
  requestedOutputCount: number;
  targetPages: Array<{ id: string; title: string; html?: string }>;
  forceSinglePage: boolean;
  projectId: string;
}) => {
  const suggestedPreset = selectWireStylePreset({
    wireId: projectId,
    userPrompt,
  });
  const plan = buildFallbackDesignPlan({
    userPrompt,
    requestedOutputCount,
    targetPages,
    forceSinglePage,
    stylePreset: suggestedPreset,
  });
  const fallbackBrief = buildFallbackDesignBrief({ plan });

  try {
    const result = await generateText({
      model: getLanguageModel({
        modelName,
        googleApiKey,
        openRouterApiKey,
        zaiApiKey,
      }),
      prompt: composeDesignBriefPrompt({
        userPrompt,
        compactHistory,
        targetPages,
        plan,
        suggestedPreset,
      }),
    });

    const designBrief = result.text.trim();
    return {
      plan,
      designBrief: designBrief || fallbackBrief,
      usedFallback: designBrief.length === 0,
    };
  } catch (error) {
    logger.warn("wire_design_brief_fallback_used", {
      projectId,
      modelName,
      reason: "design_brief_generation_failed",
      message: getErrorMessage(error),
    });

    return {
      plan,
      designBrief: fallbackBrief,
      usedFallback: true,
    };
  }
};

const generateCritiqueReport = async ({
  modelName,
  googleApiKey,
  openRouterApiKey,
  zaiApiKey,
  prompt,
  projectId,
  outputIndex,
  qualityScore,
  qualityViolations,
}: {
  modelName: WireModelName;
  googleApiKey?: string | null;
  openRouterApiKey?: string | null;
  zaiApiKey?: string | null;
  prompt: string;
  projectId: string;
  outputIndex: number;
  qualityScore: number;
  qualityViolations: string[];
}) => {
  try {
    const critiqueResult = await generateText({
      model: getLanguageModel({
        modelName,
        googleApiKey,
        openRouterApiKey,
        zaiApiKey,
      }),
      prompt,
    });

    const critique = normalizeCritiqueReport(critiqueResult.text);
    if (critique) {
      return {
        critique,
        usedFallback: false,
      };
    }
  } catch (error) {
    logger.warn("wire_critique_fallback_used", {
      projectId,
      outputIndex,
      modelName,
      reason: "critique_generation_failed",
      message: getErrorMessage(error),
    });
  }

  return {
    critique: buildFallbackCritiqueReport({
      qualityScore,
      qualityViolations,
    }),
    usedFallback: true,
  };
};

export async function POST(request: Request, context: RouteContext) {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const rateLimitResult = wireRateLimiter.check(
    `${sessionUser.id}:${getClientIp(request)}:/api/wire/[id]`,
  );
  if (!rateLimitResult.allowed) {
    return withRateLimitHeaders(
      Response.json(
        {
          error: "Rate limit exceeded.",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
        { status: 429 },
      ),
      rateLimitResult.headers,
    );
  }
  const applyRateHeaders = (response: Response) =>
    withRateLimitHeaders(response, rateLimitResult.headers);

  const project = await getProjectForUser(id, sessionUser.id);
  if (!project) {
    return applyRateHeaders(
      Response.json({ error: "Project not found." }, { status: 404 }),
    );
  }

  const parsedBody = await readJsonBodyWithLimit<unknown>(request);
  if (!parsedBody.ok) {
    return applyRateHeaders(parsedBody.response);
  }
  if (!isRecord(parsedBody.data)) {
    return applyRateHeaders(
      Response.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      ),
    );
  }

  const body = parsedBody.data as WireRequestBody;
  const validationError = validateRequestBody(body);
  if (validationError) {
    return applyRateHeaders(
      Response.json({ error: validationError }, { status: 400 }),
    );
  }

  const requestedModelRaw = body.modelName;
  if (requestedModelRaw !== undefined && !isWireModelName(requestedModelRaw)) {
    return applyRateHeaders(
      Response.json({ error: "Unsupported modelName." }, { status: 400 }),
    );
  }

  const requestedModelName = isWireModelName(requestedModelRaw)
    ? requestedModelRaw
    : undefined;
  const fallbackMessages = parseMessages(body.messages);
  const compactHistory = parseCompactHistory(body.compactHistory);
  const promptText = parsePromptText(body.promptText);
  const latestUserPrompt = promptText || getLatestUserPrompt(fallbackMessages);
  if (!latestUserPrompt) {
    return applyRateHeaders(
      Response.json({ error: "Missing promptText." }, { status: 400 }),
    );
  }

  let userAiSettings: Awaited<
    ReturnType<typeof getUserAiSettingsForGeneration>
  > = null;
  try {
    userAiSettings = await getUserAiSettingsForGeneration(sessionUser.id);
  } catch (error) {
    if (isUserApiKeyCryptoError(error)) {
      if (error.code === "CRYPTO_CONFIG_ERROR") {
        return applyRateHeaders(
          new Response("Server encryption is not configured correctly.", {
            status: 500,
          }),
        );
      }

      return applyRateHeaders(
        new Response("API key is invalid or needs to be reconfigured.", {
          status: 400,
        }),
      );
    }

    logger.error("wire_user_ai_settings_resolve_failed", { error });
    return applyRateHeaders(
      Response.json({ error: "Unable to resolve AI settings." }, { status: 500 }),
    );
  }

  if (!userAiSettings) {
    return applyRateHeaders(
      Response.json({ error: "Unable to resolve AI settings." }, { status: 500 }),
    );
  }
  if (userAiSettings.enabledModelIds.length === 0) {
    return applyRateHeaders(
      new Response(
        "No models are enabled. Enable at least one model in Models.",
        { status: 400 },
      ),
    );
  }

  const effectiveModelName = requestedModelName ?? userAiSettings.enabledModelIds[0];
  if (!userAiSettings.enabledModelIds.includes(effectiveModelName)) {
    return applyRateHeaders(
      new Response(
        `Model ${effectiveModelName} is disabled. Enable it in Models first.`,
        { status: 403 },
      ),
    );
  }
  if (isGoogleWireModel(effectiveModelName) && !userAiSettings.googleApiKey) {
    return applyRateHeaders(
      new Response(
        "Google API key is not configured. Add it in Providers to generate output.",
        { status: 400 },
      ),
    );
  }
  if (isOpenRouterWireModel(effectiveModelName) && !userAiSettings.openRouterApiKey) {
    return applyRateHeaders(
      new Response(
        "OpenRouter API key is not configured. Add it in Providers to generate output.",
        { status: 400 },
      ),
    );
  }
  if (isZaiWireModel(effectiveModelName) && !userAiSettings.zaiApiKey) {
    return applyRateHeaders(
      new Response(
        "Z.ai API key is not configured. Add it in Providers to generate output.",
        { status: 400 },
      ),
    );
  }

  const rawTargetPageId = parseOptionalString(body.targetPageId, MAX_TARGET_PAGE_ID_LENGTH);
  const rawTargetPageTitle = parseOptionalString(body.targetPageTitle);
  const rawTargetPageHtml =
    typeof body.targetPageHtml === "string"
      ? body.targetPageHtml.slice(0, MAX_TARGET_PAGE_HTML_LENGTH)
      : "";
  const requestedTargetPageIds = parseTargetPageIds(body.targetPageIds);
  const requestedVariationCount = parseVariationCount(body.variationCount);

  if (requestedVariationCount > 1 && requestedTargetPageIds.length === 0) {
    return applyRateHeaders(
      Response.json(
        { error: "targetPageIds are required when variationCount is greater than 1." },
        { status: 400 },
      ),
    );
  }

  const allPages = await listProjectPagesForUser({
    projectId: id,
    userId: sessionUser.id,
  });
  const pageById = new Map(allPages.map((page) => [page.id, page]));

  const resolvedSingleTargetPage = rawTargetPageId ? pageById.get(rawTargetPageId) ?? null : null;
  if (rawTargetPageId && !resolvedSingleTargetPage) {
    return applyRateHeaders(
      Response.json({ error: "Target page not found." }, { status: 404 }),
    );
  }

  const resolvedTargetPagesRaw =
    requestedTargetPageIds.length > 0
      ? requestedTargetPageIds.map((pageId) => pageById.get(pageId) ?? null)
      : resolvedSingleTargetPage
        ? [resolvedSingleTargetPage]
        : [];

  if (resolvedTargetPagesRaw.some((page) => page === null)) {
    return applyRateHeaders(
      Response.json({ error: "Target page not found." }, { status: 404 }),
    );
  }

  const resolvedTargetPages = resolvedTargetPagesRaw.filter(
    (
      page,
    ): page is NonNullable<(typeof resolvedTargetPagesRaw)[number]> => page !== null,
  );

  if (
    requestedTargetPageIds.length > 0 &&
    requestedVariationCount > 1 &&
    requestedTargetPageIds.length !== requestedVariationCount
  ) {
    return applyRateHeaders(
      Response.json(
        { error: "targetPageIds length must match variationCount." },
        { status: 400 },
      ),
    );
  }

  const expectedOutputCount =
    resolvedTargetPages.length > 0
      ? resolvedTargetPages.length
      : requestedVariationCount;
  const generationRun = await createGenerationRun({
    projectId: id,
    prompt: latestUserPrompt,
    selectedModelName: effectiveModelName,
    plannerModelName: effectiveModelName,
    criticModelName: effectiveModelName,
  });

  try {
    logger.info("wire_generation_attempt", {
      projectId: id,
      selectedModelName: effectiveModelName,
      plannerModelName: effectiveModelName,
      criticModelName: effectiveModelName,
      expectedOutputCount,
      targetPageCount: resolvedTargetPages.length,
    });

    const plannerTargetPages =
      resolvedTargetPages.length > 0
        ? resolvedTargetPages.map((page) => ({
            id: page.id,
            title:
              page.id === rawTargetPageId
                ? rawTargetPageTitle || page.title
                : page.title,
            html:
              page.id === rawTargetPageId
                ? rawTargetPageHtml || page.htmlContent
                : page.htmlContent,
          }))
        : [];

    const plannerPrompt = resolvedSingleTargetPage
      ? buildPageScopedPrompt({
          userPrompt: latestUserPrompt,
          targetPageId: resolvedSingleTargetPage.id,
          targetPageTitle: rawTargetPageTitle || resolvedSingleTargetPage.title,
          targetPageHtml: rawTargetPageHtml || resolvedSingleTargetPage.htmlContent,
        })
      : latestUserPrompt;

    const { plan, designBrief } = await generateDesignBrief({
      modelName: effectiveModelName,
      googleApiKey: userAiSettings.googleApiKey,
      openRouterApiKey: userAiSettings.openRouterApiKey,
      zaiApiKey: userAiSettings.zaiApiKey,
      userPrompt: plannerPrompt,
      compactHistory,
      requestedOutputCount: expectedOutputCount,
      targetPages: plannerTargetPages,
      forceSinglePage: Boolean(resolvedSingleTargetPage),
      projectId: id,
    });

    await updateGenerationRun({
      generationRunId: generationRun.id,
      status: "planned",
      stageStatus: "planned",
      generationMode: plan.generationMode,
    });

    const mappedOutputs = mapPlanOutputsToTargets({
      plan,
      targetPageIds: plannerTargetPages.map((page) => page.id),
    });

    const persistedOutputs = await createGenerationOutputs({
      generationRunId: generationRun.id,
      outputs: mappedOutputs.map((item) => ({
        targetPageId: item.targetPageId,
        outputIndex: item.outputIndex,
        outputKind: item.output.outputKind,
        title: item.output.title,
        planJson: item.output as unknown as Record<string, unknown>,
      })),
    });

    await updateGenerationRun({
      generationRunId: generationRun.id,
      status: "generating",
      stageStatus: "generating",
    });

    const outputsForAssistant = mappedOutputs.map((item, index) => ({
      outputIndex: item.outputIndex,
      title: persistedOutputs[index]?.title ?? item.output.title,
      details: "",
      html: "",
    }));
    const rejectionReasons: Array<{
      outputIndex: number;
      title: string;
      stage: "initial" | "final";
      qualityScore: number;
      qualityViolations: string[];
    }> = [];

    let successCount = 0;

    await runWithConcurrency(mappedOutputs, 2, async (item, workerIndex) => {
      const persisted = persistedOutputs[workerIndex];
      if (!persisted) {
        return;
      }

      const currentPage = item.targetPageId ? pageById.get(item.targetPageId) ?? null : null;
      const stylePreset = resolveStylePresetForPlan(plan, latestUserPrompt);
      const outputAllowsImages =
        plan.globalDesign.stockImages.enabled && item.output.imageSlots.length > 0;
      const isDirectEditRequest =
        Boolean(item.targetPageId) && Boolean(currentPage?.htmlContent.trim());

      try {
        await updateGenerationOutput({
          generationOutputId: persisted.id,
          status: "generating",
          targetPageId: item.targetPageId,
          title: item.output.title,
        });

        const initialGeneration = await generateText({
          model: getLanguageModel({
            modelName: effectiveModelName,
            googleApiKey: userAiSettings.googleApiKey,
            openRouterApiKey: userAiSettings.openRouterApiKey,
            zaiApiKey: userAiSettings.zaiApiKey,
          }),
          system: isDirectEditRequest
            ? composePageEditSystemPrompt({
                plan,
                output: item.output,
                stylePreset,
                allowImages: outputAllowsImages,
                userPrompt: latestUserPrompt,
                designBrief,
                currentHtml: currentPage?.htmlContent ?? "",
              })
            : composePlannedGenerateSystemPrompt({
                plan,
                output: item.output,
                outputIndex: item.outputIndex,
                allOutputs: plan.outputs,
                stylePreset,
                allowImages: outputAllowsImages,
                userPrompt: latestUserPrompt,
                designBrief,
              }),
          prompt: latestUserPrompt,
        });

        const initialParsed = parseWireOutput(initialGeneration.text);
        const normalizedInitial = normalizeGeneratedHtml(initialParsed.html, {
          allowImages: outputAllowsImages,
        });
        const initialQuality = buildQualitySnapshot({
          html: normalizedInitial.html,
          allowImages: outputAllowsImages,
          userPrompt: latestUserPrompt,
          stylePresetId: stylePreset.id,
          plannedImageSlots: item.output.imageSlots,
        });

        const critiqueResult = isDirectEditRequest
          ? null
          : await generateCritiqueReport({
              modelName: effectiveModelName,
              googleApiKey: userAiSettings.googleApiKey,
              openRouterApiKey: userAiSettings.openRouterApiKey,
              zaiApiKey: userAiSettings.zaiApiKey,
              prompt: composeCritiquePrompt({
                plan,
                output: item.output,
                details: initialParsed.details,
                html: normalizedInitial.html,
                qualityScore: initialQuality.score,
                qualityViolations: initialQuality.violations,
              }),
              projectId: id,
              outputIndex: item.outputIndex,
              qualityScore: initialQuality.score,
              qualityViolations: initialQuality.violations,
            });
        const critique =
          critiqueResult?.critique ??
          buildFallbackCritiqueReport({
            qualityScore: initialQuality.score,
            qualityViolations: initialQuality.violations,
          });
        const critiqueUsedFallback = critiqueResult?.usedFallback ?? true;
        let acceptedTitle = item.output.title;
        let acceptedDetails = initialParsed.details.trim();
        let acceptedHtml = normalizedInitial.html;
        let acceptedQuality = initialQuality;
        let accepted = isAcceptedGeneratedOutput({
          qualityScore: initialQuality.score,
          isRenderable: initialQuality.isRenderable,
          qualityViolations: initialQuality.violations,
        });

        if (
          !isDirectEditRequest &&
          shouldRepairGeneratedOutput({
            qualityScore: initialQuality.score,
            isRenderable: initialQuality.isRenderable,
            qualityViolations: initialQuality.violations,
            critique,
          })
        ) {
          await updateGenerationRun({
            generationRunId: generationRun.id,
            status: "repairing",
            stageStatus: "repairing",
          });
          await updateGenerationOutput({
            generationOutputId: persisted.id,
            status: "repairing",
          });

          const repairedGeneration = await generateText({
            model: getLanguageModel({
              modelName: effectiveModelName,
              googleApiKey: userAiSettings.googleApiKey,
              openRouterApiKey: userAiSettings.openRouterApiKey,
              zaiApiKey: userAiSettings.zaiApiKey,
            }),
            prompt: latestUserPrompt,
            system: composeRepairPrompt({
              plan,
              output: item.output,
              outputIndex: item.outputIndex,
              allOutputs: plan.outputs,
              stylePreset,
              allowImages: outputAllowsImages,
              userPrompt: latestUserPrompt,
              critique,
              currentHtml: normalizedInitial.html,
              designBrief,
            }),
          });

          const repairedParsed = parseWireOutput(repairedGeneration.text);
          const repairedNormalized = normalizeGeneratedHtml(repairedParsed.html, {
            allowImages: outputAllowsImages,
          });
          const repairedQuality = buildQualitySnapshot({
            html: repairedNormalized.html,
            allowImages: outputAllowsImages,
            userPrompt: latestUserPrompt,
            stylePresetId: stylePreset.id,
            plannedImageSlots: item.output.imageSlots,
          });

          acceptedTitle = item.output.title;
          acceptedDetails = repairedParsed.details.trim() || acceptedDetails;
          acceptedHtml = repairedNormalized.html;
          acceptedQuality = repairedQuality;
          accepted = isAcceptedGeneratedOutput({
            qualityScore: repairedQuality.score,
            isRenderable: repairedQuality.isRenderable,
            qualityViolations: repairedQuality.violations,
          });
        }

        if (isDirectEditRequest) {
          accepted =
            acceptedQuality.isRenderable &&
            !hasCriticalQualityViolations(acceptedQuality.violations);
        }

        if (!accepted) {
          const canAcceptThroughFallback =
            critiqueUsedFallback &&
            acceptedQuality.isRenderable &&
            acceptedQuality.score >= MIN_FALLBACK_ACCEPTANCE_SCORE &&
            !hasCriticalQualityViolations(acceptedQuality.violations);
          if (canAcceptThroughFallback) {
            logger.warn("wire_quality_gate_fallback_acceptance", {
              projectId: id,
              generationRunId: generationRun.id,
              generationOutputId: persisted.id,
              outputIndex: item.outputIndex,
              qualityScore: acceptedQuality.score,
              qualityViolations: acceptedQuality.violations,
            });
            accepted = true;
          }
        }

        if (!accepted) {
          rejectionReasons.push({
            outputIndex: item.outputIndex,
            title: item.output.title,
            stage: "initial",
            qualityScore: acceptedQuality.score,
            qualityViolations: acceptedQuality.violations,
          });
          logger.warn("wire_generation_output_rejected", {
            projectId: id,
            generationRunId: generationRun.id,
            generationOutputId: persisted.id,
            outputIndex: item.outputIndex,
            title: item.output.title,
            stage: "initial",
            qualityScore: acceptedQuality.score,
            qualityViolations: acceptedQuality.violations,
          });
          await updateGenerationOutput({
            generationOutputId: persisted.id,
            title: item.output.title,
            critiqueJson: critique as unknown as Record<string, unknown>,
            details: acceptedDetails || null,
            qualityScore: acceptedQuality.score,
            status: "failed",
            htmlSnapshot: acceptedHtml || null,
          });
          return;
        }

        const htmlWithRequiredSlots = outputAllowsImages
          ? ensurePlannedStockImageSlots({
              html: acceptedHtml,
              slots: item.output.imageSlots,
              unsplashAccessKey: userAiSettings.unsplashApiKey,
              seed: `${id}:${generationRun.id}:${item.outputIndex}`,
            })
          : acceptedHtml;
        let finalizedHtml = removeStockSlotAttributes(htmlWithRequiredSlots);
        if (outputAllowsImages && item.output.imageSlots.length > 0) {
          const resolvedStockImages = await resolveStockImagesInHtml({
            html: htmlWithRequiredSlots,
            slots: item.output.imageSlots,
            unsplashAccessKey: userAiSettings.unsplashApiKey,
            seed: `${id}:${generationRun.id}:${item.outputIndex}`,
          });
          finalizedHtml = injectStockImageMetadata(
            removeStockSlotAttributes(resolvedStockImages.html),
            resolvedStockImages.metadata,
          );
        }

        const finalizedNormalized = normalizeGeneratedHtml(finalizedHtml, {
          allowImages: outputAllowsImages,
        });
        acceptedHtml = finalizedNormalized.html;
        acceptedQuality = buildQualitySnapshot({
          html: acceptedHtml,
          allowImages: outputAllowsImages,
          userPrompt: latestUserPrompt,
          stylePresetId: stylePreset.id,
          plannedImageSlots: item.output.imageSlots,
          enforcePlannedImageSlots: false,
        });
        accepted = isAcceptedGeneratedOutput({
          qualityScore: acceptedQuality.score,
          isRenderable: acceptedQuality.isRenderable,
          qualityViolations: acceptedQuality.violations,
        });

        if (!accepted) {
          rejectionReasons.push({
            outputIndex: item.outputIndex,
            title: item.output.title,
            stage: "final",
            qualityScore: acceptedQuality.score,
            qualityViolations: acceptedQuality.violations,
          });
          logger.warn("wire_generation_output_rejected", {
            projectId: id,
            generationRunId: generationRun.id,
            generationOutputId: persisted.id,
            outputIndex: item.outputIndex,
            title: item.output.title,
            stage: "final",
            qualityScore: acceptedQuality.score,
            qualityViolations: acceptedQuality.violations,
          });
          await updateGenerationOutput({
            generationOutputId: persisted.id,
            title: item.output.title,
            critiqueJson: critique as unknown as Record<string, unknown>,
            details: acceptedDetails || null,
            qualityScore: acceptedQuality.score,
            status: "failed",
            htmlSnapshot: acceptedHtml || null,
          });
          return;
        }

        if (item.targetPageId && currentPage) {
          const nextTitle = shouldApplyPlannedTitle({
            planMode: plan.generationMode,
            currentTitle: currentPage.title,
            currentHtml: currentPage.htmlContent,
          })
            ? acceptedTitle
            : currentPage.title;

          await updateProjectPageForUser({
            projectId: id,
            pageId: item.targetPageId,
            userId: sessionUser.id,
            title: nextTitle,
            htmlContent: acceptedHtml,
          });

          pageById.set(item.targetPageId, {
            ...currentPage,
            title: nextTitle,
            htmlContent: acceptedHtml,
          });
          acceptedTitle = nextTitle;
        }

        outputsForAssistant[item.outputIndex] = {
          outputIndex: item.outputIndex,
          title: acceptedTitle,
          details: summarizeAssistantDetails({
            content: `DETAILS:\n${acceptedDetails}`,
            fallbackTitle: acceptedTitle,
          }),
          html: acceptedHtml,
        };

        await updateGenerationOutput({
            generationOutputId: persisted.id,
            title: acceptedTitle,
            critiqueJson: critique as unknown as Record<string, unknown>,
            details: outputsForAssistant[item.outputIndex].details,
            qualityScore: acceptedQuality.score,
            status: "completed",
          htmlSnapshot: acceptedHtml,
        });

        successCount += 1;
      } catch (error) {
        logger.error("wire_generation_output_failed", {
          projectId: id,
          generationRunId: generationRun.id,
          generationOutputId: persisted.id,
          outputIndex: item.outputIndex,
          error: serializeError(error),
        });
        await updateGenerationOutput({
          generationOutputId: persisted.id,
          title: item.output.title,
          status: "failed",
        });
      }
    });

    const finalStatus =
      successCount === 0
        ? "failed"
        : successCount === mappedOutputs.length
          ? "completed"
          : "partially_completed";

    await updateGenerationRun({
      generationRunId: generationRun.id,
      status: finalStatus,
      stageStatus: "completed",
      generationMode: plan.generationMode,
    });

    if (successCount === 0) {
      const firstRejection = rejectionReasons[0];
      const failureMessage = firstRejection
        ? `Generated output did not meet the quality bar. Score ${firstRejection.qualityScore}. Issues: ${firstRejection.qualityViolations
            .slice(0, 4)
            .join(", ")}.`
        : "Generated output did not meet the quality bar. Try refining the prompt.";
      logger.warn("wire_generation_run_rejected", {
        projectId: id,
        generationRunId: generationRun.id,
        modelName: effectiveModelName,
        rejectionReasons,
      });
      return applyRateHeaders(
        new Response(failureMessage, { status: 502 }),
      );
    }

    const assistantContent = buildAssistantContent({
      plan,
      outputs: outputsForAssistant,
    });

    await persistConversationTurn({
      projectId: id,
      userPrompt: latestUserPrompt,
      assistantSummary: extractAssistantSummary(assistantContent),
      targetPageId: resolvedSingleTargetPage?.id ?? undefined,
      selectedModelName: effectiveModelName,
      plannerModelName: effectiveModelName,
      criticModelName: effectiveModelName,
    });

    return applyRateHeaders(createAssistantResponse(assistantContent));
  } catch (error) {
    logger.error("wire_selected_model_stream_error", {
      modelName: effectiveModelName,
      status: getStatusCode(error),
      message: getErrorMessage(error),
      responseBody: getErrorBody(error),
      error: serializeError(error),
    });

    await updateGenerationRun({
      generationRunId: generationRun.id,
      status: "failed",
      stageStatus: "failed",
    }).catch((updateError) => {
      logger.error("wire_generation_run_update_failed", {
        generationRunId: generationRun.id,
        error: serializeError(updateError),
      });
    });

    return applyRateHeaders(
      selectedModelFailureResponse({
        modelName: effectiveModelName,
        error,
      }),
    );
  }
}
