import SettingsSkeleton from "@/app/setting/SettingsSkeleton";

/** Fills the open dialog while the settings load, so the click answers at once. */
export default function SettingModalLoading() {
  return <SettingsSkeleton />;
}
