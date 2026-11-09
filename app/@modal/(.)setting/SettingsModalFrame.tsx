"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SETTINGS_FRAME_CLASS } from "@/app/setting/settingsFrame";
import { cn } from "@/lib/utils";

/** Escape and a click outside go back to the page settings opened over. */
export default function SettingsModalFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Sign-in sends the user on to a settings link with a client navigation, so
  // the modal would open over the sign-in card. Going back from there lands
  // on /login, which sends a signed-in user to settings again, and the modal
  // could never close. Loading the full page instead leaves no way back to it.
  useLayoutEffect(() => {
    if (document.querySelector("[data-wirely-auth-page]")) window.location.replace(window.location.href);
  }, []);

  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(SETTINGS_FRAME_CLASS, "max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-[1100px]")}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
