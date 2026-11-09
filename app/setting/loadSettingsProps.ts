import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { listApiTokens } from "@/lib/auth/apiToken";
import type { SettingsTab } from "./SettingsClient";

const TABS: SettingsTab[] = ["account", "mcp", "providers", "models"];

const toTab = (value: string | undefined): SettingsTab =>
  TABS.find((tab) => tab === value) ?? "account";

/**
 * What the settings view renders with, read on the server for both the full
 * page and the modal that opens over the app. Null when no one is signed in.
 */
export const loadSettingsProps = async (tab: string | undefined) => {
  // Identity and AI settings share one users row, so read them together.
  const session = await getServerSessionUserWithAiSettings();
  if (!session) return null;
  const { user, aiSettings } = session;
  const agentTokens = await listApiTokens(user.id);

  return {
    user: { name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    initialKeys: {
      google: aiSettings.hasGoogleApiKey,
      openrouter: aiSettings.hasOpenRouterApiKey,
      zai: aiSettings.hasZaiApiKey,
      unsplash: aiSettings.hasUnsplashApiKey,
    },
    initialEnabledModelIds: aiSettings.enabledModelIds,
    initialTab: toTab(tab),
    initialAgentTokens: agentTokens.map((token) => ({
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
      createdAt: token.createdAt.toISOString(),
    })),
  };
};
