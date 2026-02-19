export const DEFAULT_WIRE_MODEL = "gemini-2.5-flash" as const;

export const GEMINI_FREE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;

export const GEMINI_PAID_MODELS = ["gemini-2.5-pro"] as const;

export type WireModelTier = "free" | "paid";
export type WireModelName =
  | (typeof GEMINI_FREE_MODELS)[number]
  | (typeof GEMINI_PAID_MODELS)[number];

export type WireModelOption = {
  id: WireModelName;
  label: string;
  tier: WireModelTier;
};

export const WIRE_MODEL_OPTIONS: WireModelOption[] = [
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    tier: "free",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tier: "free",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    tier: "paid",
  },
];

export const FREE_MODELS_FIRST: readonly WireModelName[] = WIRE_MODEL_OPTIONS.map(
  (option) => option.id,
);

export const DEFAULT_ENABLED_WIRE_MODELS: readonly WireModelName[] =
  GEMINI_FREE_MODELS;

const WIRE_MODEL_NAME_SET = new Set<WireModelName>(
  WIRE_MODEL_OPTIONS.map((option) => option.id),
);

const WIRE_MODEL_ORDER_MAP = new Map<WireModelName, number>(
  FREE_MODELS_FIRST.map((modelName, index) => [modelName, index]),
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
