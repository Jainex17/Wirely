import type { Metadata } from "next";
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
              <aside className="h-full min-h-0 overflow-y-auto rounded-lg border border-border/80 bg-card p-6 sm:p-7">
                <div className="flex flex-col items-center text-center">
                  {sessionUser.avatarUrl ? (
                    <img
                      src={sessionUser.avatarUrl}
                      alt={displayName}
                      className="h-24 w-24 rounded-full border border-border object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-foreground text-2xl font-semibold text-background">
                      {initials}
                    </div>
                  )}
                  <h1 className="mt-4 max-w-full break-words text-2xl font-semibold text-foreground">
                    {displayName}
                  </h1>
                  <p className="mt-1 max-w-full break-all text-sm text-muted-foreground">
                    {displayEmail}
                  </p>
                </div>

                <div className="mt-8 space-y-3">
                  <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Name
                    </p>
                    <p className="mt-1 text-sm text-foreground">{displayName}</p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Email
                    </p>
                    <p className="mt-1 break-all text-sm text-foreground">{displayEmail}</p>
                  </div>
                </div>
              </aside>

              <section className="h-full min-h-0 overflow-y-auto rounded-lg border border-border/80 bg-card p-6 sm:p-7 lg:p-8">
                <h2 className="text-2xl font-semibold text-foreground">Profile Settings</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Manage details, connect API keys, and choose which models appear
                  in generation dropdowns.
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
