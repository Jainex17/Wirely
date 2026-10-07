import { streamText } from "ai";
import { getRequestSessionUser } from "@/lib/auth/session";
import { appendConversationMessage, getProjectForUser } from "@/lib/db/queries/projects";
import { getUserAiSettingsForGeneration } from "@/lib/db/queries/users";
import {
  buildGenerationSystemPrompt,
  buildGenerationTools,
  type DesignGenerationEvent,
  GENERATION_MAX_STEPS,
} from "@/lib/design/generation";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { DESIGN_CATALOG, designToolHandler, listScreensHandler } from "@/lib/mcp/designTools";
import { MCP_TOOLS } from "@/lib/mcp/protocol";
import { createRateLimiter, getClientIp, withRateLimitHeaders } from "@/lib/rate-limit";
import { isUserApiKeyCryptoError } from "@/lib/security/userApiKeyCrypto";
import { isWireModelName, resolveRunnableWireModel } from "@/lib/wireModels";
import { getKeyForWireModel, getLanguageModel } from "@/lib/wireProviderClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROMPT_MAX_CHARS = 4_000;
// Under maxDuration, so the run ends cleanly with its screens saved instead
// of being cut off by the host.
const RUN_TIMEOUT_MS = 55_000;

const generationRateLimiter = createRateLimiter();

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

/** What the editor shows while a tool runs, from its name and arguments. */
const describeToolCall = (name: string, args: Record<string, unknown>) => {
  if (name === "add_screen") return `Adding screen "${String(args.name ?? "Untitled")}"`;
  if (name === "render") return args.replace_id ? "Rebuilding a section" : "Adding a section";
  if (name.startsWith("get_") || name === "list_pages") return "Reading the screens";
  if (name.includes("icon")) return "Adding icons";
  return "Refining the design";
};

/**
 * Generates screens on a project's design canvas on the user's own key: the model calls
 * the design tools, and each call saves to the project as it happens. The
 * response streams one JSON event per line for the editor's progress list.
 */
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) return fail("Unauthenticated", 401);

  const rateLimit = generationRateLimiter.check(`${sessionUser.id}:${getClientIp(request)}:design-generate`);
  if (!rateLimit.allowed) {
    return withRateLimitHeaders(fail("Rate limit exceeded. Try again in a minute.", 429), rateLimit.headers);
  }

  const { projectId } = await context.params;
  const project = await getProjectForUser(projectId, sessionUser.id);
  if (!project) return fail("Project not found.", 404);

  const parsed = await readJsonBodyWithLimit<{ prompt?: unknown; modelName?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const prompt = typeof parsed.data.prompt === "string" ? parsed.data.prompt.trim().slice(0, PROMPT_MAX_CHARS) : "";
  if (!prompt) return fail("Describe the screens to design.", 400);
  if (parsed.data.modelName !== undefined && !isWireModelName(parsed.data.modelName)) {
    return fail("Unsupported model.", 400);
  }

  let settings: Awaited<ReturnType<typeof getUserAiSettingsForGeneration>>;
  try {
    settings = await getUserAiSettingsForGeneration(sessionUser.id);
  } catch (error) {
    if (isUserApiKeyCryptoError(error) && error.code !== "CRYPTO_CONFIG_ERROR") {
      return fail("Your API key needs to be saved again in Providers.", 400);
    }
    logger.error("design_generation_settings_failed", { error });
    return fail("Could not read your AI settings.", 500);
  }
  if (!settings || settings.enabledModelIds.length === 0) {
    return fail("No models are enabled. Enable one in Models.", 400);
  }
  const keys = {
    googleApiKey: settings.googleApiKey,
    openRouterApiKey: settings.openRouterApiKey,
    zaiApiKey: settings.zaiApiKey,
  };
  const modelName = isWireModelName(parsed.data.modelName)
    ? parsed.data.modelName
    : resolveRunnableWireModel(settings.enabledModelIds, {
        google: Boolean(keys.googleApiKey),
        openrouter: Boolean(keys.openRouterApiKey),
        zai: Boolean(keys.zaiApiKey),
      });
  if (!modelName || !settings.enabledModelIds.includes(modelName)) {
    return fail("That model is not enabled. Enable it in Models.", 400);
  }
  if (!getKeyForWireModel(modelName, keys)) {
    return fail("Add an API key for this model's provider in Providers.", 400);
  }

  const tools = buildGenerationTools([...MCP_TOOLS, ...DESIGN_CATALOG], async (name, args) => {
    const handler = name === "list_pages" ? listScreensHandler : designToolHandler(name);
    if (!handler) return { content: [{ type: "text", text: `Unknown tool ${name}.` }], isError: true };
    return handler(sessionUser.id, { ...args, projectId });
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DesignGenerationEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let summary = "";
      try {
        const result = streamText({
          model: getLanguageModel({ modelName, ...keys }),
          system: buildGenerationSystemPrompt(),
          prompt,
          tools,
          maxSteps: GENERATION_MAX_STEPS,
          abortSignal: AbortSignal.timeout(RUN_TIMEOUT_MS),
          onStepFinish: ({ toolResults }) => {
            for (const toolResult of toolResults as Array<{ toolName: string; result: unknown }>) {
              send({ type: "tool-result", name: toolResult.toolName, ok: !String(toolResult.result).startsWith("Error:") });
            }
          },
        });
        for await (const part of result.fullStream) {
          if (part.type === "tool-call") {
            send({ type: "tool", name: part.toolName, label: describeToolCall(part.toolName, part.args as Record<string, unknown>) });
          } else if (part.type === "text-delta") {
            summary += part.textDelta;
          } else if (part.type === "error") {
            throw part.error;
          }
        }
        summary = summary.trim() || "Done.";
        send({ type: "done", summary });
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        logger.error("design_generation_failed", { projectId, modelName, error });
        summary = timedOut
          ? "Stopped at the time limit. The screens finished so far are saved; ask again to continue."
          : "Generation failed. Check your key and model in settings, then try again.";
        send({ type: "error", message: summary });
      } finally {
        controller.close();
        await appendConversationMessage({ projectId, role: "user", content: prompt, selectedModelName: modelName }).catch(() => undefined);
        await appendConversationMessage({ projectId, role: "assistant", content: summary, selectedModelName: modelName }).catch(() => undefined);
      }
    },
  });

  return withRateLimitHeaders(
    new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } }),
    rateLimit.headers,
  );
}
