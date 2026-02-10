"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const placeholder = useMemo(
    () => "Describe the site you want to generate...",
    [],
  );
  const userDisplayName = user?.name || user?.email || "User";

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
        body: JSON.stringify({ title: "Generated Page" }),
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
    <main className="relative overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground/70">
            Wirely
          </p>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="max-w-[220px] justify-start">
                  <span className="truncate">{userDisplayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="truncate">
                  {userDisplayName}
                </DropdownMenuLabel>
                <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground truncate">
                  {user.email || "No email"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
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

      <div className="relative h-[90vh] z-10 flex flex-col items-center justify-center px-6 pb-16 pt-24">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            Let&apos;s build something, jainex.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-foreground/70 md:text-lg">
            Describe your next launch, and we&apos;ll draft three bold directions
            grounded in your palette.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 w-full max-w-3xl">
            <div className="glass-panel flex flex-col gap-3 rounded-3xl px-4 py-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-none border-0 bg-transparent px-2 text-base text-foreground placeholder:text-foreground/50 focus:outline-none focus:border-transparent focus-visible:ring-0 overflow-hidden"
              />

              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 rounded-full px-5 text-sm"
                >
                  {isSubmitting ? "Starting..." : "Submit"}
                </Button>
              </div>
              {errorMessage ? (
                <p className="px-2 text-sm text-red-500">{errorMessage}</p>
              ) : null}
            </div>
          </form>
        </div>

      </div>
    </main>
  );
}
