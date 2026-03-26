import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import ProfileDetailsClient from "../../profile/ProfileDetailsClient";

export const metadata: Metadata = {
  title: "Profile | Wirely",
  description: "Manage your Wirely profile details.",
};

export default async function SettingProfilePage() {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login?next=/setting/profile");
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold text-foreground">Profile</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Manage the core account details used across Wirely.
        </p>
      </div>
      <ProfileDetailsClient
        userName={sessionUser.name}
        userEmail={sessionUser.email}
      />
    </div>
  );
}
