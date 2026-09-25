import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionUserWithAiSettings } from "@/lib/auth/session";
import { listApiTokens } from "@/lib/auth/apiToken";
import SettingsClient, { type SettingsTab } from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings | Wirely",
  description: "Account, provider keys, and model access for Wirely.",
};

const TABS: SettingsTab[] = ["account", "providers", "models", "mcp"];

const toTab = (value: string | undefined): SettingsTab =>
  TABS.find((tab) => tab === value) ?? "account";

export default async function SettingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Identity and AI settings share one users row, so read them together.
  const [{ tab }, session] = await Promise.all([
    searchParams,
    getServerSessionUserWithAiSettings(),
  ]);

  if (!session) {
    redirect("/login?next=/setting");
  }
  const { user: sessionUser, aiSettings } = session;

  const agentTokens = await listApiTokens(sessionUser.id);

  return (
    <SettingsClient
      user={{
        name: sessionUser.name,
        email: sessionUser.email,
        avatarUrl: sessionUser.avatarUrl,
      }}
      initialKeys={{
        google: aiSettings.hasGoogleApiKey,
        openrouter: aiSettings.hasOpenRouterApiKey,
        zai: aiSettings.hasZaiApiKey,
        unsplash: aiSettings.hasUnsplashApiKey,
      }}
      initialEnabledModelIds={aiSettings.enabledModelIds}
      initialTab={toTab(tab)}
      initialAgentTokens={agentTokens.map((token) => ({
        id: token.id,
        name: token.name,
        prefix: token.prefix,
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        createdAt: token.createdAt.toISOString(),
      }))}
    />
  );
}
