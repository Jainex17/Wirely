import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";
import { SETTINGS_FRAME_CLASS } from "./settingsFrame";
import { loadSettingsProps } from "./loadSettingsProps";

export const metadata: Metadata = {
  title: "Settings | Wirely",
  description: "Account, provider keys, and model access for Wirely.",
};

/**
 * A visit straight to /setting, or a reload of it. A link inside the app
 * opens the same view as a modal instead, from app/@modal/(.)setting.
 */
export default async function SettingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const props = await loadSettingsProps(tab);
  if (!props) redirect("/login?next=/setting");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4 sm:p-8">
      <div className={SETTINGS_FRAME_CLASS}>
        <SettingsClient {...props} variant="page" />
      </div>
    </div>
  );
}
