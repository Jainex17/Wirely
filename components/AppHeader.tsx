"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAccountMenu, { type UserAccountMenuUser } from "@/components/UserAccountMenu";

interface AppHeaderProps {
  user: UserAccountMenuUser | null;
  title?: string;
  showBackButton?: boolean;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export default function AppHeader({
  user,
  title = "Wirely",
  showBackButton = false,
  onLogout,
  isLoggingOut = false,
}: AppHeaderProps) {
  const { signOut } = useClerk();
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  const handleLogout = async () => {
    await signOut();
    if (onLogout) {
      onLogout();
      return;
    }
    router.push("/login?next=/");
  };

  return (
    <header className="h-14 bg-card border border-border rounded-lg shadow-sm px-5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        {showBackButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/")}
            aria-label="Back to home"
            title="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-foreground flex items-center justify-center">
              <span className="text-background text-sm font-bold">W</span>
            </div>
          </Link>
        )}
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {user ? (
          <UserAccountMenu
            user={user}
            isLoggingOut={isLoggingOut}
            onLogout={handleLogout}
            logoutDescription="You will need to sign in again to continue working on your projects."
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/login")}
          >
            Sign In
          </Button>
        )}
      </div>
    </header>
  );
}
