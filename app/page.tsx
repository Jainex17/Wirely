"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MeResponse {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
}

interface ProjectsResponse {
  projects: Array<{
    id: string;
    title: string;
    status: "active" | "archived";
    createdAt: string;
    updatedAt: string;
  }>;
}

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<ProjectsResponse["projects"]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const placeholder = useMemo(
    () => "Describe the site you want to generate...",
    [],
  );
  const userDisplayName = user?.name || user?.email || "User";
  const initials = useMemo(
    () =>
      userDisplayName
        .split(" ")
        .map((part) => part[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [userDisplayName],
  );

  useEffect(() => {
    let isCancelled = false;

    const loadMe = async () => {
      try {
        const response = await fetch("/me", { cache: "no-store" });
        if (!response.ok) {
          if (!isCancelled) setUser(null);
          return;
        }

        const payload = (await response.json()) as MeResponse;
        if (!isCancelled) {
          setUser(payload.user ?? null);
        }
      } catch {
        if (!isCancelled) setUser(null);
      }
    };

    loadMe();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setHistoryItems([]);
      return;
    }

    let isCancelled = false;
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (!response.ok) {
          if (!isCancelled) setHistoryItems([]);
          return;
        }

        const payload = (await response.json()) as ProjectsResponse;
        if (!isCancelled) {
          setHistoryItems(payload.projects ?? []);
        }
      } catch {
        if (!isCancelled) setHistoryItems([]);
      } finally {
        if (!isCancelled) setIsLoadingHistory(false);
      }
    };

    loadHistory();
    return () => {
      isCancelled = true;
    };
  }, [user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (response.status === 401) {
        setIsSubmitting(false);
        router.push("/login?next=/");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to create project.");
      }

      const payload = (await response.json()) as { project?: { id?: string } };
      const projectId = payload.project?.id;
      if (!projectId) {
        throw new Error("Missing project id.");
      }

      const trimmedPrompt = prompt.trim();
      if (trimmedPrompt) {
        sessionStorage.setItem(`wirePrompt:${projectId}`, trimmedPrompt);
      }

      router.push(`/wire/${projectId}`);
    } catch {
      setErrorMessage("Could not create a project. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await authClient.signOut();
    } finally {
      setUser(null);
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="min-h-dvh bg-muted p-3 text-foreground">
      <header className="h-14 rounded-lg border border-border bg-card px-5 shadow-sm">
        <div className="flex h-full w-full max-w-6xl items-center justify-between">
          <p className="text-base font-semibold text-foreground">Wirely</p>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-muted/40"
                >
                  <p className="max-w-[220px] truncate text-sm font-medium text-foreground">
                    {userDisplayName}
                  </p>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                    {initials || "U"}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 border-0 shadow-none">
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
            <Button variant="outline" onClick={() => router.push("/login")}>
              Login
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-5xl flex-col items-center text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            Let&apos;s build something, {userDisplayName}.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-foreground/70 md:text-lg">
            Describe your page idea and generate your first draft in seconds.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 w-full max-w-3xl">
            <div className="rounded-2xl border border-border bg-card p-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={placeholder}
                rows={5}
                className="mb-4 w-full resize-none border-0 bg-transparent text-base text-foreground placeholder:text-foreground/50 focus:outline-none focus-visible:ring-0"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 rounded-full px-5 text-sm"
                >
                  {isSubmitting ? "Starting..." : "Submit"}
                </Button>
              </div>
              {errorMessage ? (
                <p className="mt-3 text-sm text-red-500">{errorMessage}</p>
              ) : null}
            </div>
          </form>

          {user ? (
            <section className="mt-10 w-full max-w-3xl rounded-2xl border border-border bg-card p-5 text-left">
              <h2 className="text-base font-semibold text-foreground/85">Previous history</h2>
              {isLoadingHistory ? (
                <p className="mt-2 text-sm text-foreground/60">Loading...</p>
              ) : historyItems.length === 0 ? (
                <p className="mt-2 text-sm text-foreground/60">No previous projects yet.</p>
              ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                  {historyItems.slice(0, 8).map((project) => (
                    <li key={project.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/wire/${project.id}`)}
                        className="h-full w-full rounded-xl border border-border bg-background px-5 py-5 text-left transition-colors hover:bg-muted/30"
                      >
                        <p className="truncate text-base font-medium text-foreground">
                          {project.title}
                        </p>
                        <p className="mt-2 text-sm text-foreground/60">
                          Updated{" "}
                          {new Date(project.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
