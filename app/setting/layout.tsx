import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSessionUser } from "@/lib/auth/session";
import ProfileSettingsNav from "../profile/ProfileSettingsNav";

export default async function SettingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login?next=/setting/profile");
  }

  const displayEmail = sessionUser.email ?? "Not set";

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mt-10">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Settings
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Manage your account preferences and configuration.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Signed in as {displayEmail}
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <aside className="lg:self-start">
            <ProfileSettingsNav />
          </aside>

          <section className="min-w-0 max-w-[920px] pt-1">{children}</section>
        </div>
      </div>
    </main>
  );
}
