"use client";

import { useReducer, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inferGenerationMode } from "@/lib/inferGenerationMode";
import {
  DEFAULT_WIRE_MODEL,
  WIRE_MODEL_OPTIONS,
  getWireModelProvider,
  resolveRunnableWireModel,
  type WireModelName,
} from "@/lib/wireModels";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  AlertTriangle,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { toast } from "@/components/ui/sonner";
import GeminiIcon from "@/components/icons/GeminiIcon";

export interface HomeClientInitialData {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
  } | null;
  historyItems: Array<{
    id: string;
    title: string;
    status: "active" | "archived" | "draft";
    createdAt: string | Date;
    updatedAt: string | Date;
  }>;
  initialPrompt: string;
  enabledModelIds: WireModelName[];
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
}

const PAGE_VARIATION_OPTIONS: Array<{
  value: 2 | 3;
  label: string;
  hint: string;
}> = [
  {
    value: 2,
    label: "2 outputs",
    hint: "Generate 2 coordinated results for the selected mode",
  },
  {
    value: 3,
    label: "3 outputs",
    hint: "Generate 3 coordinated results for the selected mode",
  },
];

export type HomeGenerationMode =
  | "single_page"
  | "concept_variants"
  | "information_architecture";

const GENERATION_MODE_OPTIONS: Array<{
  value: HomeGenerationMode;
  label: string;
  hint: string;
}> = [
  {
    value: "single_page",
    label: "Single page",
    hint: "Generate one polished page",
  },
  {
    value: "concept_variants",
    label: "Concepts",
    hint: "Generate different design directions for the same brief",
  },
  {
    value: "information_architecture",
    label: "Website pages",
    hint: "Generate real site pages like Home, About, or Contact",
  },
];

const MODEL_PROVIDER_LABEL = {
  google: "Google",
  openrouter: "OpenRouter",
  zai: "Z.ai",
} as const;

const EXAMPLE_PROMPT_CHIPS = [
  "A landing page for a plant care subscription",
  "A crypto portfolio dashboard with live charts",
  "A mobile app for tracking hiking trails",
  "A multi-page site for a design studio",
] as const;

interface HomeState {
  prompt: string;
  isSubmitting: boolean;
  user: HomeClientInitialData["user"];
  errorMessage: string | null;
  historyItems: HomeClientInitialData["historyItems"];
  selectedModel: WireModelName;
  enabledModelIds: WireModelName[];
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
  // null means Wirely reads the brief and decides.
  modeOverride: HomeGenerationMode | null;
  selectedPageCount: 1 | 2 | 3;
  isLoggingOut: boolean;
  projectToDelete: string | null;
}

type HomeAction =
  | {
      type: "patch";
      payload: Partial<HomeState>;
    }
  | {
      type: "openDeleteDialog";
      projectId: string;
    }
  | {
      type: "closeDeleteDialog";
    }
  | {
      type: "removeProject";
      projectId: string;
    };

const createHomeInitialState = (
  initialData: HomeClientInitialData,
): HomeState => ({
  prompt: initialData.initialPrompt,
  isSubmitting: false,
  user: initialData.user,
  errorMessage: null,
  historyItems: initialData.historyItems,
  selectedModel:
    resolveRunnableWireModel(initialData.enabledModelIds, {
      google: initialData.hasGoogleApiKey,
      openrouter: initialData.hasOpenRouterApiKey,
      zai: initialData.hasZaiApiKey,
    }) ?? DEFAULT_WIRE_MODEL,
  enabledModelIds: initialData.enabledModelIds,
  hasGoogleApiKey: initialData.hasGoogleApiKey,
  hasOpenRouterApiKey: initialData.hasOpenRouterApiKey,
  hasZaiApiKey: initialData.hasZaiApiKey,
  modeOverride: null,
  selectedPageCount: 2,
  isLoggingOut: false,
  projectToDelete: null,
});

const homeReducer = (state: HomeState, action: HomeAction): HomeState => {
  switch (action.type) {
    case "patch":
      return {
        ...state,
        ...action.payload,
      };
    case "openDeleteDialog":
      return {
        ...state,
        projectToDelete: action.projectId,
      };
    case "closeDeleteDialog":
      return {
        ...state,
        projectToDelete: null,
      };
    case "removeProject":
      return {
        ...state,
        historyItems: state.historyItems.filter((project) => project.id !== action.projectId),
      };
    default:
      return state;
  }
};

const timeAgo = (date: string | Date) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

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
  return Math.max(seconds, 0) + " seconds ago";
};

interface HomeClientProps {
  initialData: HomeClientInitialData;
}

const modelRequiresMissingKey = ({
  modelName,
  hasGoogleApiKey,
  hasOpenRouterApiKey,
  hasZaiApiKey,
}: {
  modelName: WireModelName;
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
}) => {
  const provider = getWireModelProvider(modelName);
  if (provider === "google") return !hasGoogleApiKey;
  if (provider === "openrouter") return !hasOpenRouterApiKey;
  if (provider === "zai") return !hasZaiApiKey;
  return false;
};

export default function HomeClient({ initialData }: HomeClientProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(homeReducer, initialData, createHomeInitialState);

  const enabledModelOptions = state.enabledModelIds
    .map((modelId) => WIRE_MODEL_OPTIONS.find((model) => model.id === modelId))
    .filter((model): model is (typeof WIRE_MODEL_OPTIONS)[number] => Boolean(model));

  const activeSelectedModel = state.enabledModelIds.includes(state.selectedModel)
    ? state.selectedModel
    : resolveRunnableWireModel(state.enabledModelIds, {
        google: state.hasGoogleApiKey,
        openrouter: state.hasOpenRouterApiKey,
        zai: state.hasZaiApiKey,
      }) ?? DEFAULT_WIRE_MODEL;

  const hasNoEnabledModels = Boolean(state.user) && state.enabledModelIds.length === 0;
  const activeSelectedModelProvider = getWireModelProvider(activeSelectedModel);
  const selectedModelRequiresMissingKey = modelRequiresMissingKey({
    modelName: activeSelectedModel,
    hasGoogleApiKey: state.hasGoogleApiKey,
    hasOpenRouterApiKey: state.hasOpenRouterApiKey,
    hasZaiApiKey: state.hasZaiApiKey,
  });
  const hasAtLeastOneRunnableModel = enabledModelOptions.some(
    (model) =>
      !modelRequiresMissingKey({
        modelName: model.id,
        hasGoogleApiKey: state.hasGoogleApiKey,
        hasOpenRouterApiKey: state.hasOpenRouterApiKey,
        hasZaiApiKey: state.hasZaiApiKey,
      }),
  );
  const hasNoRunnableModels = Boolean(state.user) && !hasAtLeastOneRunnableModel;
  const showApiKeyWarning =
    Boolean(state.user) &&
    selectedModelRequiresMissingKey;
  // Only push users toward key setup when nothing they enabled can run.
  const showConfigureApiKeysCta = hasNoRunnableModels;
  const selectedModelLabel =
    WIRE_MODEL_OPTIONS.find((model) => model.id === activeSelectedModel)?.label ??
    activeSelectedModel;
  const effectiveGenerationMode =
    state.modeOverride ?? inferGenerationMode(state.prompt);
  const effectiveGenerationCount =
    effectiveGenerationMode === "single_page" ? 1 : state.selectedPageCount;
  const effectiveModeLabel =
    GENERATION_MODE_OPTIONS.find((option) => option.value === effectiveGenerationMode)
      ?.label ?? "Single page";
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.isSubmitting) return;

    if (!state.user) {
      toast.error("Sign in to generate designs.");
      router.push("/login?next=/");
      return;
    }

    if (state.enabledModelIds.length === 0) {
      dispatch({
        type: "patch",
        payload: { errorMessage: "No models are enabled. Enable at least one model in Models." },
      });
      toast.error("No models are enabled. Open Models to enable one.");
      return;
    }
    if (selectedModelRequiresMissingKey) {
      const selectedModelProviderLabel =
        MODEL_PROVIDER_LABEL[activeSelectedModelProvider];
      dispatch({
        type: "patch",
        payload: {
          errorMessage:
            `Selected model requires ${selectedModelProviderLabel} API key. Configure it in Providers or choose another model.`,
        },
      });
      toast.error(
        `Selected model requires ${selectedModelProviderLabel} API key. Configure it in Providers or choose another model.`,
      );
      return;
    }

    const trimmedPrompt = state.prompt.trim();

    dispatch({
      type: "patch",
      payload: {
        isSubmitting: true,
        errorMessage: null,
      },
    });

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      if (response.status === 401) {
        dispatch({ type: "patch", payload: { isSubmitting: false } });
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

      if (trimmedPrompt) {
        sessionStorage.setItem(`wirePrompt:${projectId}`, trimmedPrompt);
      }
      sessionStorage.setItem(`wireModel:${projectId}`, activeSelectedModel);
      sessionStorage.setItem(
        `wireGenerationMode:${projectId}`,
        effectiveGenerationMode,
      );
      sessionStorage.setItem(
        `wirePageCount:${projectId}`,
        String(effectiveGenerationCount),
      );

      router.push(`/wire/${projectId}`);
    } catch {
      dispatch({
        type: "patch",
        payload: {
          errorMessage: "Could not create a project. Please try again.",
          isSubmitting: false,
        },
      });
      toast.error("Could not create a project. Please try again.");
    }
  };

  const handleLogout = () => {
    router.refresh();
  };

  const handleDeleteProject = (
    projectId: string,
    event: MouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: "openDeleteDialog", projectId });
  };

  const confirmDeleteProject = async () => {
    if (!state.projectToDelete) return;

    try {
      const response = await fetch(`/api/projects/${state.projectToDelete}`, {
        method: "DELETE",
      });

      if (response.ok) {
        dispatch({ type: "removeProject", projectId: state.projectToDelete });
        toast.success("Project deleted.");
      } else {
        toast.error("Failed to delete project.");
      }
    } catch {
      toast.error("Failed to delete project.");
    } finally {
      dispatch({ type: "closeDeleteDialog" });
    }
  };

  const firstName = (state.user?.name ?? "").trim().split(" ")[0] ?? "";
  const composerDisabled =
    state.isSubmitting || hasNoEnabledModels || hasNoRunnableModels;

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <AppHeader
          user={state.user}
          onLogout={handleLogout}
          isLoggingOut={state.isLoggingOut}
        />
      </div>

      <main>
        <section className="relative isolate -mt-[4.25rem] flex min-h-[100dvh] items-center overflow-hidden pt-[4.25rem]">
          <div className="ribbon-field pointer-events-none -z-10">
            <div className="ribbon ribbon-core rings-enter" />
          </div>
          <div className="hero-dots pointer-events-none absolute inset-0 -z-10" />
          <div className="hero-foot pointer-events-none absolute inset-x-0 bottom-0 h-16 -z-10" />

          <div className="mx-auto w-full max-w-3xl px-4 py-14 text-center sm:px-6">
          <h1 className="enter enter-1 font-display text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-foreground">
            What are we building{firstName ? `, ${firstName}` : ""}?
          </h1>

          <form onSubmit={handleSubmit} className="enter enter-2 mt-10 text-left">
            <div className="composer pane relative overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl transition-[border-color] duration-300">
              <span className="beam" aria-hidden>
                <span className="beam-spin" />
              </span>
              <label htmlFor="home-prompt" className="sr-only">
                Describe what you want to build
              </label>
              <textarea
                id="home-prompt"
                value={state.prompt}
                onChange={(event) =>
                  dispatch({ type: "patch", payload: { prompt: event.target.value } })
                }
                placeholder="A booking page for a two-chair barbershop, dark, with a weekly calendar..."
                rows={4}
                className="w-full resize-none bg-transparent px-4 py-3.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={hasNoEnabledModels}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <GeminiIcon className="size-4 text-primary" />
                        {selectedModelLabel}
                        {showApiKeyWarning ? (
                          <AlertTriangle size={14} className="text-destructive" />
                        ) : null}
                        <ChevronDown size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      {showConfigureApiKeysCta ? (
                        <>
                          <DropdownMenuItem
                            onClick={() => router.push("/setting?tab=providers")}
                            className="text-destructive focus:text-destructive"
                          >
                            <AlertTriangle size={14} />
                            Connect a provider key first
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      {(["google", "openrouter", "zai"] as const).map((provider, index) => {
                        const providerModels = enabledModelOptions.filter(
                          (model) => model.provider === provider,
                        );
                        if (providerModels.length === 0) return null;

                        return (
                          <DropdownMenuGroup key={provider}>
                            {index > 0 || showConfigureApiKeysCta ? (
                              <DropdownMenuSeparator />
                            ) : null}
                            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                              {MODEL_PROVIDER_LABEL[provider]}
                            </DropdownMenuLabel>
                            {providerModels.map((model) => (
                              <DropdownMenuItem
                                key={model.id}
                                onClick={() =>
                                  dispatch({
                                    type: "patch",
                                    payload: { selectedModel: model.id },
                                  })
                                }
                              >
                                <span className="truncate">{model.label}</span>
                                {model.tier === "paid" ? (
                                  <span className="ml-auto rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                                    Billed
                                  </span>
                                ) : null}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        );
                      })}
                      {enabledModelOptions.length === 0 ? (
                        <DropdownMenuItem disabled>No models enabled</DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {effectiveModeLabel}
                        {state.modeOverride === null ? (
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            auto
                          </span>
                        ) : null}
                        <ChevronDown size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72">
                      <DropdownMenuItem
                        onClick={() =>
                          dispatch({ type: "patch", payload: { modeOverride: null } })
                        }
                        className="flex flex-col items-start gap-0.5"
                      >
                        <span className="font-medium">Decide for me</span>
                        <span className="text-xs text-muted-foreground">
                          Read the brief and pick one
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {GENERATION_MODE_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() =>
                            dispatch({
                              type: "patch",
                              payload: { modeOverride: option.value },
                            })
                          }
                          className="flex flex-col items-start gap-0.5"
                        >
                          <span className="font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.hint}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {effectiveGenerationMode !== "single_page" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {effectiveGenerationCount} outputs
                          <ChevronDown size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-72">
                        {PAGE_VARIATION_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() =>
                              dispatch({
                                type: "patch",
                                payload: { selectedPageCount: option.value },
                              })
                            }
                            className="flex flex-col items-start gap-0.5"
                          >
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.hint}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={composerDisabled || state.prompt.trim().length < 10}
                >
                  {state.isSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Generate"
                  )}
                </Button>
              </div>
            </div>
          </form>

          {state.prompt.trim().length === 0 ? (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => dispatch({ type: "patch", payload: { prompt: chip } })}
                  className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          {hasNoEnabledModels || hasNoRunnableModels ? (
            <p className="mt-6 text-sm text-muted-foreground">
              {hasNoEnabledModels ? (
                <>
                  No models are switched on. Turn one on in{" "}
                  <Link
                    href="/setting?tab=models"
                    className="text-primary underline underline-offset-2"
                  >
                    Models
                  </Link>
                  .
                </>
              ) : (
                <>
                  The models you enabled need a provider key. Connect one in{" "}
                  <Link
                    href="/setting?tab=providers"
                    className="text-primary underline underline-offset-2"
                  >
                    Providers
                  </Link>
                  .
                </>
              )}
            </p>
          ) : null}

          {state.errorMessage ? (
            <p className="mt-4 text-sm text-destructive">{state.errorMessage}</p>
          ) : null}
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium text-foreground">Pages you have made</h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              {state.historyItems.length}
            </span>
          </div>

          {state.historyItems.length === 0 ? (
            <div className="mt-6 border-t border-border py-12">
              <p className="text-sm text-muted-foreground">
                Nothing generated yet. The brief above becomes your first page.
              </p>
            </div>
          ) : (
            <ul className="mt-6">
              {state.historyItems.map((project) => (
                <li key={project.id} className="group relative border-t border-border">
                  <Link
                    href={`/wire/${project.id}`}
                    className="flex items-baseline gap-4 py-4 pr-12"
                  >
                    <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground transition-colors duration-300 group-hover:text-primary">
                      {project.title}
                    </span>
                    <span className="hidden font-mono text-[11px] capitalize text-muted-foreground sm:block">
                      {project.status}
                    </span>
                    <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                      {timeAgo(project.updatedAt)}
                    </span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${project.title}`}
                        className="absolute right-0 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(event) =>
                          handleDeleteProject(
                            project.id,
                            event as unknown as MouseEvent<HTMLElement>,
                          )
                        }
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 size={16} />
                        Delete project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <AlertDialog
        open={state.projectToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            dispatch({ type: "closeDeleteDialog" });
          }
        }}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              The generated pages and their history are removed for good. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => dispatch({ type: "closeDeleteDialog" })}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 size={16} />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
