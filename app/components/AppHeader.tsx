"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";

interface AppHeaderProps {
  user: {
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
  } | null;
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
  const router = useRouter();

  const name = user?.name ?? user?.email ?? "Guest";
  const initials = useMemo(
    () =>
      name
        .split(" ")
        .map((part) => part[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [name]
  );

  const handleLogout = async () => {
    if (isLoggingOut || !onLogout) return;
    await authClient.signOut();
    onLogout();
  };

  return (
    <header className="h-14 bg-card border border-border rounded-lg shadow-sm px-5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
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
      <div className="flex items-center gap-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-muted/40"
              >
                <span className="max-w-[220px] truncate text-sm font-medium text-foreground">
                  {name}
                </span>
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                    {initials || "U"}
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 border-0 shadow-none"
            >
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleLogout}
                disabled={isLoggingOut}
                variant="destructive"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
