"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authClient } from "@/lib/auth/client";

const passthroughImageLoader = ({ src }: { src: string }) => src;

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
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/profile");
  }, [router]);

  const name = user?.name ?? user?.email ?? "Guest";
  const initials = name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLogoutConfirmOpen(false);
    await authClient.signOut();
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/40"
              >
                <span className="max-w-[220px] truncate text-sm font-medium text-foreground">
                  {name}
                </span>
                {user?.avatarUrl ? (
                  <Image
                    loader={passthroughImageLoader}
                    unoptimized
                    src={user.avatarUrl}
                    alt={`${name} avatar`}
                    width={28}
                    height={28}
                    sizes="28px"
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
                onClick={() => setIsLogoutConfirmOpen(true)}
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
      <AlertDialog
        open={isLogoutConfirmOpen}
        onOpenChange={(open) => {
          if (!isLoggingOut) setIsLogoutConfirmOpen(open);
        }}
      >
        <AlertDialogContent className="logout-dialog sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of Wirely?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to continue working on your projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoggingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="logout-dialog-action"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "Logging out..." : "Log out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
