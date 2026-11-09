import SettingsClient from "@/app/setting/SettingsClient";
import { loadSettingsProps } from "@/app/setting/loadSettingsProps";

/** Settings over the page the user was on, when a link inside the app opened /setting. */
export default async function SettingModalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  // proxy.ts sends a signed-out visitor of /setting to sign in before this runs.
  const props = await loadSettingsProps(tab);
  if (!props) return null;
  return <SettingsClient {...props} variant="modal" />;
}
