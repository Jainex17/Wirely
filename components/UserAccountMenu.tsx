"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const passthroughImageLoader = ({ src }: { src: string }) => src;

export interface UserAccountMenuUser {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface UserAccountMenuProps {
  user: UserAccountMenuUser;
  logoutDescription: string;
  isLoggingOut?: boolean;
  onLogout: () => void | Promise<void>;
  profileHref?: string;
}

export default function UserAccountMenu({
  user,
  logoutDescription,
  isLoggingOut = false,
  onLogout,
  profileHref = "/setting?tab=account",
}: UserAccountMenuProps) {
  const router = useRouter();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    router.prefetch(profileHref);
  }, [profileHref, router]);

  const name = user.name ?? user.email ?? "User";
  const initials = name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLogoutConfirmOpen(false);
    await onLogout();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${name}`}
            className="flex items-center rounded-full p-0.5 transition-colors hover:bg-muted/40"
          >
            {user.avatarUrl ? (
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
        <DropdownMenuContent align="end" className="w-44 border-0 shadow-none">
          <DropdownMenuItem onClick={() => router.push(profileHref)}>
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
      <AlertDialog
        open={isLogoutConfirmOpen}
        onOpenChange={(open) => {
          if (!isLoggingOut) setIsLogoutConfirmOpen(open);
        }}
      >
        <AlertDialogContent className="logout-dialog sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of Wirely?</AlertDialogTitle>
            <AlertDialogDescription>{logoutDescription}</AlertDialogDescription>
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
    </>
  );
}
