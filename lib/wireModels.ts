export const DEFAULT_WIRE_MODEL = "gemini-2.5-flash" as const;

export const GEMINI_FREE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;

export const GEMINI_PAID_MODELS = ["gemini-2.5-pro"] as const;
export const OPENROUTER_GEMINI_FREE_MODELS = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
] as const;
export const OPENROUTER_GEMINI_PAID_MODELS = ["google/gemini-2.5-pro"] as const;
export const OPENCODE_FREE_MODELS = [
  "minimax-m2.5-free",
  "glm-5-free",
  "big-pickle",
] as const;

export type WireModelTier = "free" | "paid";
export type WireModelProvider = "google" | "openrouter" | "opencode";
export type WireModelName =
  | (typeof GEMINI_FREE_MODELS)[number]
  | (typeof GEMINI_PAID_MODELS)[number]
  | (typeof OPENROUTER_GEMINI_FREE_MODELS)[number]
  | (typeof OPENROUTER_GEMINI_PAID_MODELS)[number]
  | (typeof OPENCODE_FREE_MODELS)[number];

export type WireModelOption = {
  id: WireModelName;
  label: string;
  description: string;
  tier: WireModelTier;
  provider: WireModelProvider;
};

export const WIRE_MODEL_OPTIONS: WireModelOption[] = [
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    description: "Fast, lightweight Gemini model for quick and low-cost tasks.",
    tier: "free",
    provider: "google",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Balanced speed and quality for most day-to-day generation.",
    tier: "free",
    provider: "google",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Highest-quality Gemini option, billed by your Google plan.",
    tier: "paid",
    provider: "google",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite (OpenRouter)",
    description:
      "Fast Gemini model via OpenRouter using your OpenRouter account.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (OpenRouter)",
    description:
      "Balanced Gemini model via OpenRouter using your OpenRouter account.",
    tier: "free",
    provider: "openrouter",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro (OpenRouter)",
    description:
      "Highest-quality Gemini option via OpenRouter using your OpenRouter account.",
    tier: "paid",
    provider: "openrouter",
  },
  {
    id: "minimax-m2.5-free",
    label: "MiniMax M2.5 Free (OpenCode)",
    description: "OpenCode Zen free model offered for limited-time feedback.",
    tier: "free",
    provider: "opencode",
  },
  {
    id: "glm-5-free",
    label: "GLM-5 Free (OpenCode)",
    description: "OpenCode Zen free model offered for limited-time feedback.",
    tier: "free",
    provider: "opencode",
  },
  {
    id: "big-pickle",
    label: "Big Pickle (OpenCode)",
    description: "OpenCode Zen stealth free model offered for limited-time feedback.",
    tier: "free",
    provider: "opencode",
  },
];

export const DISPLAY_ORDER_MODELS: readonly WireModelName[] = WIRE_MODEL_OPTIONS.map(
  (option) => option.id,
);

export const DEFAULT_ENABLED_WIRE_MODELS: readonly WireModelName[] = [
  ...GEMINI_FREE_MODELS,
  ...OPENCODE_FREE_MODELS,
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

export const isGoogleWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "google";

export const isOpenRouterWireModel = (modelName: WireModelName) =>
  getWireModelProvider(modelName) === "openrouter";

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
