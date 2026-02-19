import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import ProfileAiSettingsClient from "./ProfileAiSettingsClient";

export default async function ProfilePage() {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login?next=/profile");
  }

  return (
    <main className="min-h-dvh bg-muted p-4">
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <div className="mt-6 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="mt-1 text-base text-foreground">
              {sessionUser.name ?? "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="mt-1 text-base text-foreground">
              {sessionUser.email ?? "Not set"}
            </p>
          </div>
        </div>
        <ProfileAiSettingsClient />
      </div>
    </main>
  );
}
