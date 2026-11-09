import SettingsSkeleton from "./SettingsSkeleton";
import { SETTINGS_FRAME_CLASS } from "./settingsFrame";

export default function SettingLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4 sm:p-8">
      <div className={SETTINGS_FRAME_CLASS}>
        <SettingsSkeleton />
      </div>
    </div>
  );
}
