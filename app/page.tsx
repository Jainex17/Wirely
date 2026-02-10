"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_WIRE_MODEL,
  WIRE_MODEL_OPTIONS,
  type WireModelName,
} from "@/app/lib/wireModels";
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
import {
  Github,
  LayoutGrid,
  File,
  ArrowUp,
  ChevronDown,
  Circle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

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
    status: "active" | "archived" | "draft";
    createdAt: string;
    updatedAt: string;
  }>;
}

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<
    ProjectsResponse["projects"]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedModel, setSelectedModel] =
    useState<WireModelName>(DEFAULT_WIRE_MODEL);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const placeholder = useMemo(() => "Ask Wirely to build...", []);
  const geminiModels = useMemo(
    () => WIRE_MODEL_OPTIONS.filter((item) => item.provider === "gemini"),
    [],
  );
  const openRouterModels = useMemo(
    () => WIRE_MODEL_OPTIONS.filter((item) => item.provider === "openrouter"),
    [],
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
          setHistoryItems(
            payload.projects?.map((p) => ({ ...p, status: "draft" })) ?? [],
          );
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
      sessionStorage.setItem(`wireModel:${projectId}`, selectedModel);

      router.push(`/wire/${projectId}`);
    } catch {
      setErrorMessage("Could not create a project. Please try again.");
      setIsSubmitting(false);
    }
  };

  const timeAgo = (date: string) => {
    const seconds = Math.floor(
      (new Date().getTime() - new Date(date).getTime()) / 1000,
    );
    let interval = seconds / 31536000;
    if (interval > 1) {
      return Math.floor(interval) + " years ago";
    }
    interval = seconds / 2592000;
    if (interval > 1) {
      return Math.floor(interval) + " months ago";
    }
    interval = seconds / 86400;
    if (interval > 1) {
      return Math.floor(interval) + "d ago";
    }
    interval = seconds / 3600;
    if (interval > 1) {
      return Math.floor(interval) + " hours ago";
    }
    interval = seconds / 60;
    if (interval > 1) {
      return Math.floor(interval) + " minutes ago";
    }
    return Math.floor(seconds) + " seconds ago";
  };

  const handleLogout = () => {
    setUser(null);
    setHistoryItems([]);
    setIsLoggingOut(false);
  };

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectToDelete(projectId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      const response = await fetch(`/api/projects/${projectToDelete}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setHistoryItems((prev) => prev.filter((p) => p.id !== projectToDelete));
      } else {
        alert("Failed to delete project");
      }
    } catch {
      alert("Failed to delete project");
    } finally {
      setProjectToDelete(null);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-muted p-3 gap-3 overflow-hidden">
      <AppHeader
        user={user}
        title="Wirely"
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
      />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-medium text-center mt-8 text-foreground">
            What do you want to create?
          </h1>

          <div className="mt-8">
            <form onSubmit={handleSubmit}>
              <div className="bg-card border border-border rounded-xl p-4">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={placeholder}
                  rows={4}
                  className="w-full bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                />
                <div className="flex justify-between items-center mt-4">
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-transparent border-border hover:bg-muted"
                        >
                          <Circle size={16} className="text-primary mr-2" />
                          {WIRE_MODEL_OPTIONS.find(
                            (m) => m.id === selectedModel,
                          )?.label || selectedModel}{" "}
                          <ChevronDown size={16} className="ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-card border-border">
                        {geminiModels.map((model) => (
                          <DropdownMenuItem
                            key={model.id}
                            onClick={() => setSelectedModel(model.id)}
                          >
                            {model.label}
                          </DropdownMenuItem>
                        ))}
                        {openRouterModels.map((model) => (
                          <DropdownMenuItem
                            key={model.id}
                            onClick={() => setSelectedModel(model.id)}
                          >
                            {model.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting || prompt.trim().length < 10}
                    className={
                      prompt.trim().length >= 10
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    <ArrowUp size={16} />
                  </Button>
                </div>
              </div>
            </form>
            <div className="text-center text-sm text-muted-foreground mt-2">
              Select a model and start building{" "}
            </div>
          </div>

          {(isLoadingHistory || historyItems.length > 0) && (
            <div className="mt-16">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium text-muted-foreground">
                  Recent Projects
                </h2>
              </div>
              {isLoadingHistory ? (
                <div className="animate-pulse mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="p-4 bg-muted rounded-lg h-32"
                    >
                      <div className="h-5 bg-muted-foreground/20 rounded w-3/4 mb-4"></div>
                      <div className="flex items-center justify-between mt-auto">
                        <div className="h-4 bg-muted-foreground/20 rounded w-12"></div>
                        <div className="h-4 bg-muted-foreground/20 rounded w-16"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {historyItems.map((project) => (
                    <div key={project.id}>
                      <Link
                        href={`/wire/${project.id}`}
                        className="flex flex-col p-4 bg-card rounded-lg h-full min-h-[120px] transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium line-clamp-2 flex-1">{project.title}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.preventDefault()}
                                className="p-1 hover:bg-muted-foreground/10 rounded transition-colors ml-2 flex-shrink-0"
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="bg-card border-border"
                            >
                              <DropdownMenuItem
                                onClick={(e) =>
                                  handleDeleteProject(
                                    project.id,
                                    e as unknown as React.MouseEvent,
                                  )
                                }
                                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                              >
                                <Trash2 size={16} className="mr-2" />
                                Delete Project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center justify-between mt-auto text-muted-foreground text-sm">
                          <span>Draft</span>
                          <span>{timeAgo(project.updatedAt)}</span>
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="bg-card border border-border rounded-lg shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-xl">
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete this project? This action cannot
              be undone and all associated data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              onClick={() => {
                setProjectToDelete(null);
                setIsDeleteDialogOpen(false);
              }}
              className="bg-card border border-border text-foreground hover:bg-secondary"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 size={16} className="mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
