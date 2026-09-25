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

export type WireModelTier = "free" | "paid";
export type WireModelProvider =
  | "google"
  | "openrouter"
  | "zai";
export type WireModelName =
  | (typeof GEMINI_FREE_MODELS)[number]
  | (typeof GEMINI_PAID_MODELS)[number]
  | (typeof OPENROUTER_GEMINI_FREE_MODELS)[number]
  | (typeof OPENROUTER_GEMINI_PAID_MODELS)[number]
  | (typeof OPENROUTER_FREE_MODELS)[number]
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
  typeof value === "string" && WIRE_MODEL_NAME_SET.has(value as WireModelName);

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
): WireModelProvider => {
  return WIRE_MODEL_PROVIDER_MAP.get(modelName) ?? "google";
};

export const WIRE_MODEL_PROVIDER_LABEL: Record<WireModelProvider, string> = {
  google: "Google",
  openrouter: "OpenRouter",
  zai: "Z.ai",
};

export const isGoogleWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "google";

export const isOpenRouterWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "openrouter";

export const isZaiWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "zai";

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
