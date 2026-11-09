import type { WireModelName } from "@/lib/wireModels";

/**
 * Settings opens as a modal over the editor or the projects page, which stay
 * mounted under it. They read the user's models and keys once, so settings
 * announces each saved change on window and they update without a reload.
 */
export interface AiSettingsChange {
  enabledModelIds: WireModelName[];
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
}

const EVENT = "wirely:ai-settings-changed";

export const announceAiSettingsChange = (change: AiSettingsChange) =>
  window.dispatchEvent(new CustomEvent<AiSettingsChange>(EVENT, { detail: change }));

/** Calls `listener` on every change. Returns the unsubscribe function. */
export const onAiSettingsChange = (listener: (change: AiSettingsChange) => void) => {
  const handle = (event: Event) => listener((event as CustomEvent<AiSettingsChange>).detail);
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
};
