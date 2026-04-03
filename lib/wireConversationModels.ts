export interface WireConversationModelUsage {
  selectedModelName?: string | null;
  plannerModelName?: string | null;
  criticModelName?: string | null;
}

const normalizeModelName = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const getWireConversationModelUsage = (
  usage: WireConversationModelUsage,
) => {
  const selectedModelName = normalizeModelName(usage.selectedModelName);
  const plannerModelName = normalizeModelName(usage.plannerModelName);
  const criticModelName = normalizeModelName(usage.criticModelName);

  if (!selectedModelName && !plannerModelName && !criticModelName) {
    return null;
  }

  return {
    selectedModelName,
    plannerModelName,
    criticModelName,
    hasSpecializedStages:
      Boolean(selectedModelName) &&
      (plannerModelName !== selectedModelName ||
        criticModelName !== selectedModelName),
  };
};
