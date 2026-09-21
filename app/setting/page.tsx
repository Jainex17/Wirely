import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import { listApiTokens } from "@/lib/auth/apiToken";
import { isLocalAgentOnline } from "@/lib/db/queries/localAgent";
import { getUserAiSettings } from "@/lib/db/queries/users";
import { DEFAULT_ENABLED_WIRE_MODELS } from "@/lib/wireModels";
import SettingsClient, { type SettingsTab } from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings | Wirely",
  description: "Account, provider keys, and model access for Wirely.",
};

const TABS: SettingsTab[] = ["account", "providers", "models", "agent"];

const toTab = (value: string | undefined): SettingsTab =>
  TABS.find((tab) => tab === value) ?? "account";

export default async function SettingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, sessionUser] = await Promise.all([
    searchParams,
    getServerSessionUser(),
  ]);

  if (!sessionUser) {
    redirect("/login?next=/setting");
  }

  const [settings, agentTokens, agentOnline] = await Promise.all([
    getUserAiSettings(sessionUser.id),
    listApiTokens(sessionUser.id),
    isLocalAgentOnline(sessionUser.id),
  ]);

  return (
    <SettingsClient
      user={{
        name: sessionUser.name,
        email: sessionUser.email,
        avatarUrl: sessionUser.avatarUrl,
      }}
      initialKeys={{
        google: settings?.hasGoogleApiKey ?? false,
        openrouter: settings?.hasOpenRouterApiKey ?? false,
        zai: settings?.hasZaiApiKey ?? false,
        unsplash: settings?.hasUnsplashApiKey ?? false,
      }}
      initialEnabledModelIds={
        settings?.enabledModelIds ?? [...DEFAULT_ENABLED_WIRE_MODELS]
      }
      initialDiscoveredLocalModelIds={settings?.discoveredLocalModelIds ?? []}
      initialTab={toTab(tab)}
      initialAgentTokens={agentTokens.map((token) => ({
        id: token.id,
        name: token.name,
        prefix: token.prefix,
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        createdAt: token.createdAt.toISOString(),
      }))}
      initialAgentOnline={agentOnline}
    />
  );
}
