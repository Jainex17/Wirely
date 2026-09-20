export const DEFAULT_WIRE_MODEL = "gemini-3.8-flash" as const;

export const GEMINI_FREE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
] as const;

export const GEMINI_PAID_MODELS = ["gemini-3.1-pro-preview"] as const;
export const OPENROUTER_GEMINI_FREE_MODELS = [
  "google/gemini-3.5-flash-lite",
  "google/gemini-3.8-flash",
] as const;
export const OPENROUTER_GEMINI_PAID_MODELS = [
  "google/gemini-3.1-pro-preview",
] as const;
export const OPENROUTER_FREE_MODELS = [
  "z-ai/glm-5.2:free",
  "openrouter/free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "thinkingmachines/inkling:free",
  "inclusionai/ling-3.0-flash-vl:free",
  ...OPENROUTER_GEMINI_FREE_MODELS,
] as const;
export const ZAI_FREE_MODELS = ["glm-4.7-flash", "glm-4.5-flash"] as const;

/**
 * Models that run through the user's local agent rather than a hosted provider.
 *
 * Free on any opencode account, so they need no key at all: the "credential" is
 * a connected agent. Ordered fastest first, measured by running the concept
 * prompt for two screens against each one. See lib/opencode/models.ts.
 */
export const OPENCODE_FREE_MODELS = [
  "opencode/ling-3.0-flash-fin-free",
  "opencode/muse-spark-1.3-contributor-free",
  "opencode/mimo-v2.5-free",
] as const;

export type WireModelTier = "free" | "paid";
export type WireModelProvider = "google" | "openrouter" | "zai" | "opencode";
export type WireModelName =
  | (typeof GEMINI_FREE_MODELS)[number]
  | (typeof GEMINI_PAID_MODELS)[number]
  | (typeof OPENROUTER_GEMINI_FREE_MODELS)[number]
  | (typeof OPENROUTER_GEMINI_PAID_MODELS)[number]
  | (typeof OPENROUTER_FREE_MODELS)[number]
  | (typeof OPENCODE_FREE_MODELS)[number]
  | (typeof ZAI_FREE_MODELS)[number];

export type WireModelOption = {
  id: WireModelName;
  label: string;
  description: string;
  tier: WireModelTier;
  provider: WireModelProvider;
};

export const WIRE_MODEL_OPTIONS: WireModelOption[] = [
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    description:
      "Cost-efficient Gemini model for fast, high-volume generation tasks.",
    tier: "free",
    provider: "google",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    description:
      "Latest flagship Flash model with strong reasoning, free tier available.",
    tier: "free",
    provider: "google",
  },
  {
    id: "gemini-3.7-flash",
    label: "Gemini 3.7 Flash",
    description:
      "High-speed Flash model for everyday coding and agentic tasks.",
    tier: "free",
    provider: "google",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    description:
      "Most advanced Gemini Pro model, billed by your Google plan.",
    tier: "paid",
    provider: "google",
  },
  {
    id: "z-ai/glm-5.2:free",
    label: "GLM 5.2 (Free)",
    description:
      "Z.ai GLM model served free via OpenRouter — no credits required.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "openrouter/free",
    label: "Free Models Router (OpenRouter)",
    description:
      "OpenRouter router that automatically picks from available free models — no credits required.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron 3 Ultra (Free)",
    description:
      "NVIDIA frontier reasoning model with a 1M-token context, served free via OpenRouter.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    label: "Nemotron 3.5 Lightning (Free)",
    description:
      "High-throughput NVIDIA model for fast agentic workloads, free via OpenRouter.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "thinkingmachines/inkling:free",
    label: "Inkling (Free)",
    description:
      "Thinking Machines general-purpose MoE model with a 1M-token context, free via OpenRouter.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "inclusionai/ling-3.0-flash-vl:free",
    label: "Ling 3.0 Flash VL (Free)",
    description:
      "Vision-language model that understands screenshots and images, free via OpenRouter.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "google/gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite (OpenRouter)",
    description:
      "Cost-efficient Gemini model via OpenRouter, billed to your OpenRouter credits.",
    tier: "paid",
    provider: "openrouter",
  },
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash (OpenRouter)",
    description:
      "Latest flagship Flash model via OpenRouter, billed to your OpenRouter credits.",
    tier: "paid",
    provider: "openrouter",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (OpenRouter)",
    description:
      "Most advanced Gemini Pro model via OpenRouter using your OpenRouter account.",
    tier: "paid",
    provider: "openrouter",
  },
  {
    id: "glm-4.7-flash",
    label: "GLM-4.7 Flash",
    description:
      "Fast Z.ai model with strong coding performance and free-tier access.",
    tier: "free",
    provider: "zai",
  },
  {
    id: "glm-4.5-flash",
    label: "GLM-4.5 Flash",
    description:
      "Free Z.ai reasoning and coding model with strong agent capabilities.",
    tier: "free",
    provider: "zai",
  },
  {
    id: "opencode/ling-3.0-flash-fin-free",
    label: "Ling 3.0 Flash (local)",
    description:
      "Fastest free model on your local agent. Around 20s for two concepts.",
    tier: "free",
    provider: "opencode",
  },
  {
    id: "opencode/muse-spark-1.3-contributor-free",
    label: "Muse Spark 1.3 (local)",
    description: "Free model on your local agent, a little slower than Ling.",
    tier: "free",
    provider: "opencode",
  },
  {
    id: "opencode/mimo-v2.5-free",
    label: "MiMo v2.5 (local)",
    description: "Free model on your local agent, a third option to compare against.",
    tier: "free",
    provider: "opencode",
  },
];

export const DISPLAY_ORDER_MODELS: readonly WireModelName[] = WIRE_MODEL_OPTIONS.map(
  (option) => option.id,
);

export const DEFAULT_ENABLED_WIRE_MODELS: readonly WireModelName[] = [
  ...GEMINI_FREE_MODELS,
];

const WIRE_MODEL_NAME_SET = new Set<WireModelName>(
  WIRE_MODEL_OPTIONS.map((option) => option.id),
);

const WIRE_MODEL_ORDER_MAP = new Map<WireModelName, number>(
  DISPLAY_ORDER_MODELS.map((modelName, index) => [modelName, index]),
);

export const isWireModelName = (value: unknown): value is WireModelName =>
  typeof value === "string" &&
  WIRE_MODEL_NAME_SET.has(value as WireModelName);

export const sortWireModelsFreeFirst = (modelNames: WireModelName[]) =>
  [...modelNames].sort((left, right) => {
    const leftOrder = WIRE_MODEL_ORDER_MAP.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = WIRE_MODEL_ORDER_MAP.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });

const WIRE_MODEL_PROVIDER_MAP = new Map<WireModelName, WireModelProvider>(
  WIRE_MODEL_OPTIONS.map((option) => [option.id, option.provider]),
);

export const getWireModelProvider = (
  modelName: WireModelName,
): WireModelProvider => WIRE_MODEL_PROVIDER_MAP.get(modelName) ?? "google";

export const WIRE_MODEL_PROVIDER_LABEL: Record<WireModelProvider, string> = {
  google: "Google",
  openrouter: "OpenRouter",
  zai: "Z.ai",
  opencode: "opencode (local)",
};

export const isGoogleWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "google";

export const isOpenRouterWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "openrouter";

export const isZaiWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "zai";

/**
 * True when this model runs on the user's machine.
 *
 * These take a different path entirely: the request is queued for the local
 * agent instead of going through the hosted wire route, and no provider key is
 * involved.
 */
export const isOpencodeWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "opencode";

export const resolveFastWireModelForStage = (
  modelName: WireModelName,
): WireModelName => {
  if (isGoogleWireModel(modelName)) {
    return GEMINI_FREE_MODELS[0];
  }

  if (isOpenRouterWireModel(modelName)) {
    return OPENROUTER_GEMINI_FREE_MODELS[0];
  }

  return ZAI_FREE_MODELS[0];
};

export const normalizeEnabledWireModels = (
  modelNames: unknown,
): WireModelName[] => {
  if (!Array.isArray(modelNames)) return [];

  const unique = new Set<WireModelName>();
  for (const modelName of modelNames) {
    if (isWireModelName(modelName)) {
      unique.add(modelName);
    }
  }

  return sortWireModelsFreeFirst([...unique]);
};

export const resolveEnabledWireModels = (modelNames: unknown): WireModelName[] => {
  if (modelNames === null || modelNames === undefined) {
    return [...DEFAULT_ENABLED_WIRE_MODELS];
  }

  if (!Array.isArray(modelNames)) {
    return [...DEFAULT_ENABLED_WIRE_MODELS];
  }

  return normalizeEnabledWireModels(modelNames);
};

export interface WireProviderKeyPresence {
  google: boolean;
  openrouter: boolean;
  zai: boolean;
  /**
   * opencode has no key: this is whether a local agent is connected.
   *
   * Optional because most callers have no reason to know about the agent. When
   * it is absent an opencode model is simply never auto-selected as runnable,
   * which is the safe default: picking one without an agent would queue work
   * nothing can claim.
   */
  opencode?: boolean;
}

/**
 * Picks the first enabled model (free tiers first) whose provider has a key,
 * so users land on a runnable model instead of one that will fail with a
 * "missing API key" error.
 */
export const resolveRunnableWireModel = (
  enabledModelIds: WireModelName[],
  providerKeyPresence: WireProviderKeyPresence,
): WireModelName | null => {
  for (const modelName of sortWireModelsFreeFirst(enabledModelIds)) {
    if (providerKeyPresence[getWireModelProvider(modelName)]) {
      return modelName;
    }
  }
  return enabledModelIds[0] ?? null;
};
