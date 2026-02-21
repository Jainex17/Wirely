import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getServerSessionUser } from "@/lib/auth/session";
import ProfileAiSettingsClient from "./ProfileAiSettingsClient";

export const metadata: Metadata = {
  title: "Profile | Wirely",
  description: "Manage your Wirely profile and AI model settings.",
};


export default async function ProfilePage() {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login?next=/profile");
  }

  const displayName = sessionUser.name ?? "Not set";
  const displayEmail = sessionUser.email ?? "Not set";
  const initials =
    (sessionUser.name ?? sessionUser.email ?? "User")
      .split(" ")
      .map((segment) => segment[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <main className="h-screen w-full overflow-hidden bg-muted p-3">
      <div className="flex h-full w-full flex-col gap-2">
        <AppHeader
          user={{
            name: sessionUser.name,
            email: sessionUser.email,
            avatarUrl: sessionUser.avatarUrl,
          }}
          title="Profile"
          showBackButton
        />

        <div className="min-h-0 flex-1 overflow-hidden px-1 py-1 sm:px-2 sm:py-2">
          <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-hidden">
            <div className="grid h-full min-h-0 min-w-[860px] w-full grid-cols-[320px_minmax(0,1fr)] gap-5 lg:mx-auto lg:max-w-6xl xl:mx-0 xl:max-w-none">
              <aside className="h-full min-h-0 overflow-y-auto rounded-lg border border-border/80 bg-card p-6">
                <div className="flex flex-col items-center text-center">
                  {sessionUser.avatarUrl ? (
                    <Image
                      unoptimized
                      src={sessionUser.avatarUrl}
                      alt={displayName}
                      width={80}
                      height={80}
                      sizes="80px"
                      className="h-20 w-20 rounded-full border border-border object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-foreground text-xl font-semibold text-background">
                      {initials}
                    </div>
                  )}
                  <h1 className="mt-4 max-w-full break-words text-xl font-semibold text-foreground">
                    {displayName}
                  </h1>
                  <p className="mt-1 max-w-full break-all text-sm text-muted-foreground">
                    {displayEmail}
                  </p>
                  <p className="mt-5 max-w-[240px] text-xs text-muted-foreground">
                    Account details and generation settings.
                  </p>
                </div>
              </aside>

              <section className="h-full min-h-0 overflow-y-auto rounded-lg border border-border/80 bg-card p-6 lg:p-7">
                <h2 className="text-xl font-semibold text-foreground">Profile Settings</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Manage details, API keys, and model availability.
                </p>
                <ProfileAiSettingsClient
                  userName={sessionUser.name}
                  userEmail={sessionUser.email}
                />
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
