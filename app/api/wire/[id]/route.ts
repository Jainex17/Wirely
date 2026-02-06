import { generateText, streamText } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const OPENROUTER_MODELS = Array.from(
  new Set(["z-ai/glm-4.5-air:free", "qwen/qwen3-coder:free"]),
);
type WireMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `
You generate a single, fully-designed HTML page from the user's request.
Return plain text only with exactly two sections in this order:

DETAILS:
- 3 to 6 sentences describing the layout, copy, and visual direction.
- Plain text only. No markdown, no lists, no code fences.

HTML:
- A full HTML document starting with <!doctype html>.
- Inline all CSS in a <style> tag.
- Do not include markdown or code fences.
`.trim();

const insufficientFundsResponse = () =>
  new Response("Can't process request due to insufficient funds.", {
    status: 402,
  });

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
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
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

const streamWithOpenRouter = async (
  apiKey: string | undefined,
  messages: WireMessage[],
) => {
  if (!apiKey) {
    console.error("[wire] OpenRouter error", {
      modelName: "unknown",
      message: "Missing OpenRouter API key",
    });
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
        system: SYSTEM_PROMPT,
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
          console.info("[wire] OpenRouter response", {
            modelName,
            textPreview: text.slice(0, 500),
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

export async function POST(request: Request) {
  const body = await request.json();
  const messages = parseMessages(body?.messages);
  const geminiModelName = "gemini-2.0-flash-lite";

  try {
    console.info("[wire] Gemini probe attempt", { modelName: geminiModelName });
    await generateText({
      model: google(geminiModelName),
      prompt: "OK",
      maxTokens: 1,
      maxRetries: 0,
    });
    console.info("[wire] Gemini probe success", { modelName: geminiModelName });
  } catch (error) {
    console.error("[wire] Gemini probe error", {
      modelName: geminiModelName,
      status: getStatusCode(error),
      message: getErrorMessage(error),
      responseBody: getErrorBody(error),
      error: serializeError(error),
    });
    try {
      const result = await streamWithOpenRouter(
        process.env.OPENROUTER_API_KEY,
        messages,
      );
      return result.toDataStreamResponse();
    } catch (openRouterError) {
      console.error("[wire] OpenRouter fallback error", {
        status: getStatusCode(openRouterError),
        message: getErrorMessage(openRouterError),
        responseBody: getErrorBody(openRouterError),
        error: serializeError(openRouterError),
      });
      return insufficientFundsResponse();
    }
  }

  try {
    console.info("[wire] Gemini attempt", { modelName: geminiModelName });
    const result = streamText({
      model: google(geminiModelName),
      messages,
      system: SYSTEM_PROMPT,
      onError: ({ error }) => {
        console.error("[wire] Gemini stream error", {
          modelName: geminiModelName,
          status: getStatusCode(error),
          message: getErrorMessage(error),
          responseBody: getErrorBody(error),
          error: serializeError(error),
        });
      },
      onFinish: ({ text, finishReason, usage, response }) => {
        console.info("[wire] Gemini response", {
          modelName: geminiModelName,
          text,
          finishReason,
          usage,
          responseBody: response?.body,
        });
      },
    });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[wire] Gemini error", {
      modelName: geminiModelName,
      status: getStatusCode(error),
      message: getErrorMessage(error),
      responseBody: getErrorBody(error),
      error: serializeError(error),
    });
    try {
      const result = await streamWithOpenRouter(
        process.env.OPENROUTER_API_KEY,
        messages,
      );
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
