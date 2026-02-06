import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const OPENROUTER_MODELS = Array.from(
  new Set(["qwen/qwen3-coder:free", "z-ai/glm-4.5-air:free"]),
);
type WireMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `
You are an expert product designer + frontend engineer.
Generate a single, production-quality marketing page from the user's request.
Aim for the quality bar of tools like Lovable, v0, and Bolt: polished layout, strong visual hierarchy, clean spacing, crisp typography, and intentional motion.
Return plain text only with exactly two sections in this order:

DETAILS:
- 1 to 2 sentences describing the layout, copy, and visual direction.
- Plain text only. No markdown, no lists, no code fences.

HTML:
- A full HTML document starting with <!doctype html>.
- Use semantic HTML5 structure (header, main, section, footer).
- Use Tailwind CSS utility classes for all styling.
- Include <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script> in <head>.
- Include <script src="https://cdn.jsdelivr.net/npm/@tailwindplus/elements@1" type="module"></script> in <head>.
- Include responsive meta viewport.
- Do not include a <style> tag.
- Do not use inline style attributes (no style="...").
- Do not include markdown or code fences.

Design quality requirements:
- Translate the request into a clear product intent, audience, and tone before writing HTML.
- Choose one clear visual direction and execute it consistently.
- Avoid generic templates and default styling. Make it look intentionally designed.
- Do not use the common "dark + purple gradient SaaS" look unless the user explicitly asks for it.
- Use a strong, readable type scale and consistent spacing rhythm.
- Include meaningful states: hover/focus transitions for interactive elements.
- Build the page component-by-component with at least: hero, feature/value section, proof/social section, and a final CTA.
- Keep copy concise, benefit-driven, and realistic.
- Avoid lorem ipsum and filler labels.
- Ensure AA-friendly contrast and accessible landmarks/labels.
- Keep composition clean: fewer but stronger visual moves, no noisy ornaments.
- Avoid oversized clip-path blobs and extremely long inline SVG paths.
- Prefer elegant cards, grids, separators, and subtle gradients made with Tailwind classes.
- Typography rule: avoid Inter, Roboto, Arial, and generic system-only font stacks.
- Do not use <img> or background images unless the user explicitly asks for images.

Iframe/runtime constraints:
- This HTML runs inside an iframe srcdoc. Keep it fully self-contained.
- Use CDN or inline assets only; do not use local file paths.
- Keep JavaScript minimal and optional. No frameworks/build tools/import maps.
- Prefer static, reliable markup that renders correctly without user interaction.
- Do not rely on popups, top-level navigation, or parent-window access.
- Keep the page responsive for desktop and mobile.
- Keep output concise and maintainable: target 140-260 lines of HTML.

Final validation before responding:
- Verify there is NO <style> tag and NO inline style attributes.
- Verify all visual styling comes from Tailwind classes.
- Verify output matches exactly DETAILS then HTML.
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
  const geminiModelName = "gemini-2.5-flash";
  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;

  try {
    console.info("[wire] Gemini attempt", { modelName: geminiModelName });
    const result = streamText({
      model: google(geminiModelName, { apiKey: googleApiKey }),
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
      const result = await streamWithOpenRouter(openrouterApiKey, messages);
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
