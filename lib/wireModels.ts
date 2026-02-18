export const DEFAULT_WIRE_MODEL = "gemini-2.5-flash" as const;

export const GEMINI_FREE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export const OPENROUTER_FREE_MODELS = [
  "qwen/qwen3-coder:free",
  "z-ai/glm-4.5-air:free",
] as const;

export type WireModelProvider = "gemini" | "openrouter";
export type WireModelName =
  | (typeof GEMINI_FREE_MODELS)[number]
  | (typeof OPENROUTER_FREE_MODELS)[number];

export type WireModelOption = {
  id: WireModelName;
  label: string;
  provider: WireModelProvider;
};

export const WIRE_MODEL_OPTIONS: WireModelOption[] = [
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    provider: "gemini",
  },
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen 3 Coder (Free)",
    provider: "openrouter",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    label: "GLM 4.5 Air (Free)",
    provider: "openrouter",
  },
];

const WIRE_MODEL_PROVIDER_MAP = new Map<WireModelName, WireModelProvider>(
  WIRE_MODEL_OPTIONS.map((option) => [option.id, option.provider]),
);

const WIRE_MODEL_NAME_SET = new Set<WireModelName>(
  WIRE_MODEL_OPTIONS.map((option) => option.id),
);

export const isWireModelName = (value: unknown): value is WireModelName =>
  typeof value === "string" &&
  WIRE_MODEL_NAME_SET.has(value as WireModelName);

export const getWireModelProvider = (
  modelName: string,
): WireModelProvider | undefined =>
  WIRE_MODEL_PROVIDER_MAP.get(modelName as WireModelName);
