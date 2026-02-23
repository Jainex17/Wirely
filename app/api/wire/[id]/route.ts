import { createDataStreamResponse, formatDataStreamPart, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  composeGenerateSystemPrompt,
  selectWireStylePreset,
  type WireStylePreset,
} from "@/lib/wirePrompt";
import {
  parseBatchWireOutput,
  parseWireOutput,
  userExplicitlyRequestedImages,
} from "@/lib/wireOutput";
import {
  getWireModelProvider,
  isGoogleWireModel,
  isOpenRouterWireModel,
  isWireModelName,
  type WireModelName,
} from "@/lib/wireModels";
import { getRequestSessionUser } from "@/lib/auth/session";
import {
  appendConversationMessage,
  getProjectPageForUser,
  getProjectForUser,
} from "@/lib/db/queries/projects";
import { getUserAiSettingsForGeneration } from "@/lib/db/queries/users";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { isUserApiKeyCryptoError } from "@/lib/security/userApiKeyCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const wireRateLimiter = createRateLimiter();
const includeErrorStack = process.env.NODE_ENV !== "production";
const OPENCODE_SERVER_URL =
  process.env.OPENCODE_SERVER_URL?.trim() || "http://127.0.0.1:4096";
const OPENCODE_DIRECTORY = process.env.OPENCODE_DIRECTORY?.trim() || process.cwd();
const OPENCODE_AGENT = process.env.OPENCODE_AGENT?.trim() || "build";
const OPENCODE_INACTIVE_MESSAGE =
  "OpenCode is inactive. Run `opencode serve` in your terminal and retry.";

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

const MAX_PROMPT_TEXT_LENGTH = 12_000;
const MAX_MESSAGE_COUNT = 60;
const MAX_MESSAGE_CONTENT_LENGTH = 12_000;
const MAX_COMPACT_HISTORY_COUNT = 24;
const MAX_TARGET_PAGE_ID_LENGTH = 128;
const MAX_TARGET_PAGE_TITLE_LENGTH = 200;
const MAX_TARGET_PAGE_HTML_LENGTH = 250_000;
const MAX_VARIATION_THEME_HINT_LENGTH = 2_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isIntegerInRange = (
  value: unknown,
  min: number,
  max: number,
): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

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
  if (isOpenCodeInactiveError(error)) {
    return new Response(error.message, { status: 503 });
  }

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
    logger.error("wire_conversation_persist_failed", { error });
  }
};

const streamWithGoogleModel = async ({
  projectId,
  modelName,
  googleApiKey,
  messages,
  systemPrompt,
  stylePreset,
  allowImages,
  userPrompt,
  targetPageId,
}: {
  projectId: string;
  modelName: WireModelName;
  googleApiKey: string;
  messages: WireMessage[];
  systemPrompt: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
  targetPageId?: string;
}) => {
  const googleProvider = createGoogleGenerativeAI({ apiKey: googleApiKey });
  return streamText({
    model: googleProvider(modelName),
    messages,
    system: systemPrompt,
    onError: ({ error }) => {
      logger.error("wire_gemini_stream_error", {
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

const streamWithOpenRouterModel = async ({
  projectId,
  modelName,
  openRouterApiKey,
  messages,
  systemPrompt,
  stylePreset,
  allowImages,
  userPrompt,
  targetPageId,
}: {
  projectId: string;
  modelName: WireModelName;
  openRouterApiKey: string;
  messages: WireMessage[];
  systemPrompt: string;
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
  targetPageId?: string;
}) => {
  const openRouterProvider = createOpenRouter({ apiKey: openRouterApiKey });
  return streamText({
    model: openRouterProvider(modelName),
    messages,
    system: systemPrompt,
    onError: ({ error }) => {
      logger.error("wire_openrouter_stream_error", {
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

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const createBasicAuthHeader = () => {
  const username = process.env.OPENCODE_SERVER_USERNAME?.trim();
  const password = process.env.OPENCODE_SERVER_PASSWORD?.trim();

  if (!password) return null;
  const normalizedUsername = username || "opencode";
  return `Basic ${Buffer.from(`${normalizedUsername}:${password}`).toString(
    "base64",
  )}`;
};

const openCodeHeaders = (contentType = false) => {
  const authHeader = createBasicAuthHeader();
  return {
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(authHeader ? { Authorization: authHeader } : {}),
    "x-opencode-directory": OPENCODE_DIRECTORY,
  };
};

const getSessionIdFromOpenCodeResponse = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (record.session && typeof record.session === "object") {
    const sessionRecord = record.session as Record<string, unknown>;
    if (typeof sessionRecord.id === "string") return sessionRecord.id;
  }
  return null;
};

const extractOpenCodeText = (value: unknown): string => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;

  const parts = Array.isArray(record.parts) ? record.parts : [];
  const textFromParts = parts
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return "";
      const partRecord = part as Record<string, unknown>;
      if (partRecord.type !== "text") return "";
      if (typeof partRecord.text === "string") return partRecord.text;
      if (
        partRecord.text &&
        typeof partRecord.text === "object" &&
        typeof (partRecord.text as Record<string, unknown>).value === "string"
      ) {
        return String((partRecord.text as Record<string, unknown>).value);
      }
      return "";
    })
    .filter(Boolean)
    .join("");
  if (textFromParts.trim()) return textFromParts;

  if (typeof record.text === "string" && record.text.trim()) {
    return record.text;
  }

  if (record.info && typeof record.info === "object") {
    const info = record.info as Record<string, unknown>;
    if (typeof info.text === "string" && info.text.trim()) {
      return info.text;
    }
    if (typeof info.content === "string" && info.content.trim()) {
      return info.content;
    }
  }

  return "";
};

const buildOpenCodePrompt = ({
  systemPrompt,
  messages,
}: {
  systemPrompt: string;
  messages: WireMessage[];
}) => {
  const transcript = messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}:\n${message.content.trim()}`,
    )
    .join("\n\n");

  return [
    "Follow these instructions exactly.",
    "",
    "SYSTEM:",
    systemPrompt,
    "",
    "CONVERSATION:",
    transcript,
  ].join("\n");
};

class OpenCodeInactiveError extends Error {
  constructor(message = OPENCODE_INACTIVE_MESSAGE) {
    super(message);
    this.name = "OpenCodeInactiveError";
  }
}

const isOpenCodeInactiveError = (error: unknown): error is OpenCodeInactiveError =>
  error instanceof OpenCodeInactiveError ||
  (error instanceof Error && error.name === "OpenCodeInactiveError");

const isOpenCodeStatusActive = (payload: unknown): boolean => {
  if (typeof payload === "boolean") {
    return payload;
  }

  if (typeof payload === "string") {
    const normalized = payload.trim().toLowerCase();
    if (["inactive", "stopped", "offline", "disconnected", "down", "unhealthy", "error"].includes(normalized)) {
      return false;
    }
    if (["active", "running", "ready", "connected", "up", "ok", "healthy"].includes(normalized)) {
      return true;
    }
    return false;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const candidateRecords: Record<string, unknown>[] = [record];
  if (record.session && typeof record.session === "object" && !Array.isArray(record.session)) {
    candidateRecords.push(record.session as Record<string, unknown>);
  }
  if (record.server && typeof record.server === "object" && !Array.isArray(record.server)) {
    candidateRecords.push(record.server as Record<string, unknown>);
  }

  const directBooleanFields = [
    "active",
    "isActive",
    "connected",
    "isConnected",
    "running",
    "ready",
  ] as const;

  for (const candidate of candidateRecords) {
    for (const field of directBooleanFields) {
      if (typeof candidate[field] === "boolean") {
        return candidate[field] as boolean;
      }
    }

    const statusField = candidate.status;
    if (typeof statusField === "string") {
      const normalized = statusField.trim().toLowerCase();
      if (["inactive", "stopped", "offline", "disconnected", "down", "unhealthy", "error"].includes(normalized)) {
        return false;
      }
      if (["active", "running", "ready", "connected", "up", "ok", "healthy"].includes(normalized)) {
        return true;
      }
    }
  }

  return false;
};

const generateWithOpenCode = async ({
  modelName,
  systemPrompt,
  messages,
}: {
  modelName: WireModelName;
  systemPrompt: string;
  messages: WireMessage[];
}) => {
  const baseUrl = stripTrailingSlash(OPENCODE_SERVER_URL);
  const directoryParam = encodeURIComponent(OPENCODE_DIRECTORY);
  const statusUrl = `${baseUrl}/global/health`;

  let statusResponse: Response;
  try {
    statusResponse = await fetch(statusUrl, {
      method: "GET",
      headers: openCodeHeaders(),
      cache: "no-store",
    });
  } catch {
    throw new OpenCodeInactiveError();
  }
  if (!statusResponse.ok) {
    throw new OpenCodeInactiveError();
  }

  const statusRaw = await statusResponse.text();
  let statusPayload: unknown = null;
  if (statusRaw.trim()) {
    try {
      statusPayload = JSON.parse(statusRaw) as unknown;
    } catch {
      statusPayload = statusRaw.trim();
    }
  }

  if (statusPayload !== null && !isOpenCodeStatusActive(statusPayload)) {
    throw new OpenCodeInactiveError();
  }

  const createSessionResponse = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: openCodeHeaders(),
    cache: "no-store",
  });
  if (!createSessionResponse.ok) {
    throw new Error("OpenCode could not create a session.");
  }

  const sessionPayload = (await createSessionResponse.json()) as unknown;
  const sessionId = getSessionIdFromOpenCodeResponse(sessionPayload);
  if (!sessionId) {
    throw new Error("OpenCode did not return a session id.");
  }

  const prompt = buildOpenCodePrompt({ systemPrompt, messages });
  const messageResponse = await fetch(
    `${baseUrl}/session/${sessionId}/message?directory=${directoryParam}`,
    {
      method: "POST",
      headers: openCodeHeaders(true),
      cache: "no-store",
      body: JSON.stringify({
        agent: OPENCODE_AGENT,
        model: {
          providerID: getWireModelProvider(modelName),
          modelID: modelName,
        },
        messageID: `msg_${Date.now()}`,
        parts: [
          {
            id: `prt_${Date.now()}`,
            type: "text",
            text: prompt,
          },
        ],
      }),
    },
  );

  if (!messageResponse.ok) {
    const errorBody = await messageResponse.text();
    throw new Error(
      errorBody.trim() || `OpenCode request failed (${messageResponse.status}).`,
    );
  }

  const responsePayload = (await messageResponse.json()) as unknown;
  const text = extractOpenCodeText(responsePayload).trim();
  if (!text) {
    throw new Error("OpenCode returned an empty response.");
  }

  return text;
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

  const requestedModelRaw = body?.modelName;
  if (requestedModelRaw !== undefined && !isWireModelName(requestedModelRaw)) {
    return applyRateHeaders(
      Response.json({ error: "Unsupported modelName." }, { status: 400 }),
    );
  }

  const requestedModelName = isWireModelName(requestedModelRaw)
    ? requestedModelRaw
    : undefined;
  const variationCount = parseVariationCount(body.variationCount);
  const variationIndex = parseVariationIndex(body.variationIndex, variationCount);
  const variationThemeHint = parseOptionalString(
    body.variationThemeHint,
    MAX_VARIATION_THEME_HINT_LENGTH,
  );
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
    return applyRateHeaders(
      Response.json({ error: "Missing promptText." }, { status: 400 }),
    );
  }

  const rawTargetPageId = parseOptionalString(
    body?.targetPageId,
    MAX_TARGET_PAGE_ID_LENGTH,
  );
  const rawTargetPageTitle = parseOptionalString(
    body?.targetPageTitle,
    MAX_TARGET_PAGE_TITLE_LENGTH,
  );
  const rawTargetPageHtml =
    typeof body?.targetPageHtml === "string"
      ? body.targetPageHtml.slice(0, MAX_TARGET_PAGE_HTML_LENGTH)
      : "";

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
      return applyRateHeaders(
        Response.json({ error: "Target page not found." }, { status: 404 }),
      );
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
        "No models are enabled. Enable at least one model in Profile.",
        { status: 400 },
      ),
    );
  }

  const effectiveModelName =
    requestedModelName ?? userAiSettings.enabledModelIds[0];
  if (!userAiSettings.enabledModelIds.includes(effectiveModelName)) {
    return applyRateHeaders(
      new Response(
        `Model ${effectiveModelName} is disabled. Enable it in Profile first.`,
        { status: 403 },
      ),
    );
  }
  if (isGoogleWireModel(effectiveModelName) && !userAiSettings.googleApiKey) {
    return applyRateHeaders(
      new Response(
        "Google API key is not configured. Add it in Profile to generate output.",
        { status: 400 },
      ),
    );
  }
  if (
    isOpenRouterWireModel(effectiveModelName) &&
    !userAiSettings.openRouterApiKey
  ) {
    return applyRateHeaders(
      new Response(
        "OpenRouter API key is not configured. Add it in Profile to generate output.",
        { status: 400 },
      ),
    );
  }

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

  logger.info("wire_generation_attempt", {
    stylePresetId: stylePreset.id,
    requestedModelName,
    effectiveModelName,
    targetPageId: resolvedTargetPageId,
    variationCount,
    variationIndex: variationIndex ?? null,
    batchMode: isBatchVariationRequest,
  });

  try {
    if (isGoogleWireModel(effectiveModelName)) {
      const result = await streamWithGoogleModel({
        projectId: id,
        modelName: effectiveModelName,
        googleApiKey: userAiSettings.googleApiKey as string,
        messages,
        systemPrompt,
        stylePreset,
        allowImages,
        userPrompt: latestUserPrompt,
        targetPageId: resolvedTargetPageId ?? undefined,
      });

      return applyRateHeaders(
        result.toDataStreamResponse({
          headers: {
            "cache-control": "no-store, no-transform",
          },
        }),
      );
    }

    if (isOpenRouterWireModel(effectiveModelName)) {
      const result = await streamWithOpenRouterModel({
        projectId: id,
        modelName: effectiveModelName,
        openRouterApiKey: userAiSettings.openRouterApiKey as string,
        messages,
        systemPrompt,
        stylePreset,
        allowImages,
        userPrompt: latestUserPrompt,
        targetPageId: resolvedTargetPageId ?? undefined,
      });

      return applyRateHeaders(
        result.toDataStreamResponse({
          headers: {
            "cache-control": "no-store, no-transform",
          },
        }),
      );
    }

    const opencodeText = await generateWithOpenCode({
      modelName: effectiveModelName,
      systemPrompt,
      messages,
    });

    logQualityTelemetry({
      text: opencodeText,
      stylePreset,
      allowImages,
      userPrompt: latestUserPrompt,
      modelName: effectiveModelName,
    });
    void persistConversationTurn({
      projectId: id,
      userPrompt: latestUserPrompt,
      assistantSummary: extractAssistantSummary(opencodeText),
      targetPageId: resolvedTargetPageId ?? undefined,
    });

    return applyRateHeaders(
      createDataStreamResponse({
        headers: {
          "cache-control": "no-store, no-transform",
        },
        execute: (dataStream) => {
          dataStream.write(formatDataStreamPart("text", opencodeText));
          dataStream.write(
            formatDataStreamPart("finish_message", { finishReason: "stop" }),
          );
        },
      }),
    );
  } catch (error) {
    logger.error("wire_selected_model_stream_error", {
      modelName: effectiveModelName,
      status: getStatusCode(error),
      message: getErrorMessage(error),
      responseBody: getErrorBody(error),
      error: serializeError(error),
    });
    return applyRateHeaders(
      selectedModelFailureResponse({
        modelName: effectiveModelName,
        error,
      }),
    );
  }
}
