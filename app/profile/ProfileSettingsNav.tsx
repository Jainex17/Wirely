"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, Sparkles, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const SETTINGS_ITEMS = [
  {
    href: "/setting/profile",
    label: "Profile",
    description: "Manage your account details.",
    icon: UserRound,
  },
  {
    href: "/setting/provider",
    label: "Providers",
    description: "Add and manage provider API keys.",
    icon: KeyRound,
  },
  {
    href: "/setting/model",
    label: "Models",
    description: "Choose which models are available.",
    icon: Sparkles,
  },
] as const;

const isActiveItem = (pathname: string, href: string) =>
  href === "/setting/profile" ? pathname === href : pathname.startsWith(href);

export default function ProfileSettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Profile settings navigation">
      <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {SETTINGS_ITEMS.map((item) => {
          const active = isActiveItem(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group min-w-[160px] rounded-lg px-3 py-3 text-left transition-colors lg:min-w-0",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "rounded-md p-2",
                    active
                      ? "bg-foreground text-background"
                      : "bg-transparent text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{item.label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
