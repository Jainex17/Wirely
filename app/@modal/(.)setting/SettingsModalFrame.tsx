"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SETTINGS_FRAME_CLASS } from "@/app/setting/settingsFrame";
import { cn } from "@/lib/utils";

/** Escape and a click outside go back to the page settings opened over. */
export default function SettingsModalFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
