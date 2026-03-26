import type { Metadata } from "next";
import ProfileProvidersClient from "../../profile/ProfileProvidersClient";

export const metadata: Metadata = {
  title: "Providers | Wirely",
  description: "Manage provider API keys for Wirely generation.",
};

export default function SettingProviderPage() {
  return (
    <div className="space-y-1.5">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold text-foreground">
          BYOK AI Providers
        </h2>
      </div>
      <ProfileProvidersClient />
    </div>
  );
}
