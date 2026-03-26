import type { Metadata } from "next";
import ProfileModelsClient from "../../profile/ProfileModelsClient";

export const metadata: Metadata = {
  title: "Models | Wirely",
  description: "Manage model availability for Wirely generation.",
};

export default function SettingModelPage() {
  return (
    <ProfileModelsClient />
  );
}
