/**
 * Builds an AI SDK language model from a wire model name and the user's keys.
 *
 * Shared so the generation route and the project-title route construct clients
 * the same way. Every call is paid for by a key the user saved: there is no
 * server-owned key in this path.
 *
 * opencode models are absent on purpose. They run on the user's machine through
 * the local agent and never resolve to a hosted client, so callers must handle
 * them before reaching here.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import {
  getWireModelProvider,
  isGoogleWireModel,
  isZaiWireModel,
  type WireModelName,
} from "@/lib/wireModels";

export const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4/";

export interface WireProviderKeys {
  googleApiKey?: string | null;
  openRouterApiKey?: string | null;
  zaiApiKey?: string | null;
}

export const getLanguageModel = ({
  modelName,
  googleApiKey,
  openRouterApiKey,
  zaiApiKey,
}: WireProviderKeys & { modelName: WireModelName }) => {
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

/**
 * The key a model needs, or null when the user has not saved one.
 *
 * Callers use this to decide whether a model is runnable before building a
 * client that would fail on an empty key.
 */
export const getKeyForWireModel = (
  modelName: WireModelName,
  keys: WireProviderKeys,
): string | null => {
  switch (getWireModelProvider(modelName)) {
    case "google":
      return keys.googleApiKey ?? null;
    case "zai":
      return keys.zaiApiKey ?? null;
    case "openrouter":
      return keys.openRouterApiKey ?? null;
    // opencode runs locally and has no key to check.
    default:
      return null;
  }
};
