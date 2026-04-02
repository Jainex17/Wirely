"use client";

import { useReducer, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ENABLED_WIRE_MODELS,
  DEFAULT_WIRE_MODEL,
  WIRE_MODEL_OPTIONS,
  getWireModelProvider,
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
  ArrowUp,
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
  enabledModelIds: WireModelName[];
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
}

const PAGE_VARIATION_OPTIONS: Array<{
  value: 1 | 2 | 3;
  label: string;
  hint: string;
}> = [
  {
    value: 1,
    label: "1 design",
    hint: "Generate a single page design",
  },
  {
    value: 2,
    label: "2 concepts/pages",
    hint: "Generate 2 adaptive outputs: concepts for option prompts, real pages for site-map prompts",
  },
  {
    value: 3,
    label: "3 concepts/pages",
    hint: "Generate 3 adaptive outputs: concepts for option prompts, real pages for site-map prompts",
  },
];

const MODEL_PROVIDER_LABEL = {
  google: "Google",
  openrouter: "OpenRouter",
  zai: "Z.ai",
} as const;

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
      type: "logout";
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
  prompt: "",
  isSubmitting: false,
  user: initialData.user,
  errorMessage: null,
  historyItems: initialData.historyItems,
  selectedModel: initialData.enabledModelIds[0] ?? DEFAULT_WIRE_MODEL,
  enabledModelIds: initialData.enabledModelIds,
  hasGoogleApiKey: initialData.hasGoogleApiKey,
  hasOpenRouterApiKey: initialData.hasOpenRouterApiKey,
  hasZaiApiKey: initialData.hasZaiApiKey,
  selectedPageCount: 1,
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
    case "logout":
      return {
        ...state,
        user: null,
        historyItems: [],
        enabledModelIds: [...DEFAULT_ENABLED_WIRE_MODELS],
        hasGoogleApiKey: true,
        hasOpenRouterApiKey: true,
        hasZaiApiKey: true,
        selectedModel: DEFAULT_WIRE_MODEL,
        isLoggingOut: false,
        errorMessage: null,
        projectToDelete: null,
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
    : state.enabledModelIds[0] ?? DEFAULT_WIRE_MODEL;

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
  const showConfigureApiKeysCta =
    Boolean(state.user) &&
    enabledModelOptions.some((model) =>
      modelRequiresMissingKey({
        modelName: model.id,
        hasGoogleApiKey: state.hasGoogleApiKey,
        hasOpenRouterApiKey: state.hasOpenRouterApiKey,
        hasZaiApiKey: state.hasZaiApiKey,
      }),
    );
  const selectedModelLabel =
    WIRE_MODEL_OPTIONS.find((model) => model.id === activeSelectedModel)?.label ??
    activeSelectedModel;
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
        `wirePageCount:${projectId}`,
        String(state.selectedPageCount),
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
    dispatch({ type: "logout" });
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

  return (
    <div className="h-screen w-full flex flex-col bg-muted p-3 gap-2 overflow-hidden">
      <AppHeader
        user={state.user}
        title="Wirely"
        onLogout={handleLogout}
        isLoggingOut={state.isLoggingOut}
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
                  value={state.prompt}
                  onChange={(event) =>
                    dispatch({ type: "patch", payload: { prompt: event.target.value } })
                  }
                  placeholder="Ask Wirely to build..."
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
                          disabled={hasNoEnabledModels}
                        >
                          <GeminiIcon className="mr-2 size-4 text-primary" />
                          {selectedModelLabel}{" "}
                          {showApiKeyWarning ? (
                            <AlertTriangle
                              size={14}
                              className="ml-1 mr-1 text-destructive"
                            />
                          ) : null}
                          <ChevronDown size={16} className="ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-card border-border">
                        {showConfigureApiKeysCta ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => router.push("/setting/provider")}
                              className="text-destructive focus:text-destructive"
                            >
                              <AlertTriangle size={14} className="mr-2" />
                              First configure API keys
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
                              <DropdownMenuLabel className="px-2 py-1.5 text-xs">
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
                                  className="flex items-start gap-2"
                                >
                                  <GeminiIcon className="mr-2 mt-0.5 size-4 text-primary" />
                                  <span>{model.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          );
                        })}
                        {enabledModelOptions.length === 0 ? (
                          <DropdownMenuItem disabled>
                            No models enabled
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-transparent border-border hover:bg-muted"
                        >
                          Variations: {state.selectedPageCount}
                          <ChevronDown size={16} className="ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-card border-border">
                        {PAGE_VARIATION_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() =>
                              dispatch({
                                type: "patch",
                                payload: { selectedPageCount: option.value },
                              })
                            }
                            className="flex flex-col items-start"
                          >
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.hint}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      state.isSubmitting ||
                      state.prompt.trim().length < 10 ||
                      hasNoEnabledModels ||
                      hasNoRunnableModels
                    }
                    className={
                      state.prompt.trim().length >= 10 &&
                      !hasNoEnabledModels &&
                      !hasNoRunnableModels
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {state.isSubmitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ArrowUp size={16} />
                    )}
                  </Button>
                </div>
              </div>
            </form>
            <div className="text-center text-sm text-muted-foreground mt-2">
              {hasNoEnabledModels ? (
                <>
                  No models enabled. Update your settings in{" "}
                  <Link
                    href="/setting/model"
                    className="text-primary underline underline-offset-2"
                  >
                    Models
                  </Link>
                  .
                </>
              ) : hasNoRunnableModels ? (
                <>
                  Enabled models require provider API keys. Configure them in{" "}
                  <Link
                    href="/setting/provider"
                    className="text-primary underline underline-offset-2"
                  >
                    Providers
                  </Link>{" "}
                  or choose a model that does not require one.
                </>
              ) : (
                "Select a model and start building"
              )}
            </div>
            {state.errorMessage ? (
              <div className="mt-3 text-center text-sm text-destructive">
                {state.errorMessage}
              </div>
            ) : null}
          </div>

          {state.historyItems.length > 0 ? (
            <div className="mt-16">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium text-muted-foreground">
                  Recent Projects
                </h2>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {state.historyItems.map((project) => (
                  <div key={project.id}>
                    <Link
                      href={`/wire/${project.id}`}
                      className="flex flex-col p-4 bg-card rounded-lg h-full min-h-[120px] transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium line-clamp-2 flex-1">
                          {project.title}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(event) => event.preventDefault()}
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
                              onClick={(event) =>
                                handleDeleteProject(
                                  project.id,
                                  event as unknown as MouseEvent<HTMLElement>,
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
            </div>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={state.projectToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            dispatch({ type: "closeDeleteDialog" });
          }
        }}
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
                dispatch({ type: "closeDeleteDialog" });
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
