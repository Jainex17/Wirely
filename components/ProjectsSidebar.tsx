"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { CirclePlus, LayoutGrid, Settings } from "lucide-react";
import UserAccountMenu, { type UserAccountMenuUser } from "@/components/UserAccountMenu";
import WirelyMark from "@/components/icons/WirelyMark";
import { timeAgo } from "@/lib/timeAgo";

export interface ConnectedAgent {
  name: string;
  lastUsedAt: string | Date;
}

const rowClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors";

/**
 * The projects page's left rail on desktop. Phones get AppHeader instead, so
 * the grid keeps the full width.
 */
export default function ProjectsSidebar({
  user,
  agents,
}: {
  user: UserAccountMenuUser | null;
  agents: ConnectedAgent[];
}) {
  const { signOut } = useClerk();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push("/login?next=/projects");
  };

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border px-3 pb-3 md:flex">
      <Link
        href="/projects"
        className="flex h-14 shrink-0 items-center gap-2 px-2.5 text-[15px] font-semibold tracking-tight"
      >
        <WirelyMark className="size-5" />
        Wirely
      </Link>

      <nav className="flex shrink-0 flex-col gap-0.5">
        <Link
          href="/projects"
          aria-current="page"
          className={`${rowClass} bg-accent font-medium text-foreground`}
        >
          <LayoutGrid className="size-4 text-muted-foreground" />
          All projects
        </Link>
        <Link
          href="/setting"
          className={`${rowClass} text-muted-foreground hover:bg-accent/60 hover:text-foreground`}
        >
          <Settings className="size-4" />
          Settings
        </Link>
      </nav>

      <p className="mt-6 shrink-0 px-2.5 pb-1.5 text-xs text-muted-foreground">Agents</p>
      {/* Only the agent list scrolls, so a long list or a short window never
          pushes the connect link and the account menu off the pinned rail. */}
      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {agents.map((agent) => (
          <div key={agent.name} className={`${rowClass} shrink-0 text-foreground`}>
            <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
              <span className="size-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="min-w-0 flex-1 truncate">{agent.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(agent.lastUsedAt)}
            </span>
          </div>
        ))}
      </div>
      <Link
        href="/setting?tab=mcp"
        className={`${rowClass} mt-0.5 shrink-0 text-muted-foreground hover:bg-accent/60 hover:text-foreground`}
      >
        <CirclePlus className="size-4" />
        Connect an agent
      </Link>

      {user ? (
        <div className="mt-auto flex shrink-0 items-center gap-2 px-1.5 pt-3">
          <UserAccountMenu
            user={user}
            onLogout={handleLogout}
            logoutDescription="You will need to sign in again to continue working on your projects."
          />
          <span className="truncate text-[13px] text-foreground">
            {user.name ?? user.email}
          </span>
        </div>
      ) : null}
    </aside>
  );
}
