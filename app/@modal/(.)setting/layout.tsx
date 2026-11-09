import SettingsModalFrame from "./SettingsModalFrame";

/**
 * The dialog lives in the layout, so it stays mounted while the loading
 * skeleton gives way to the settings, and opens with one animation.
 */
export default function SettingModalLayout({ children }: { children: React.ReactNode }) {
  return <SettingsModalFrame>{children}</SettingsModalFrame>;
}
