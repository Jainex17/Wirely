import { redirect } from "next/navigation";

export default function LegacySettingRoute() {
  redirect("/setting?tab=providers");
}
