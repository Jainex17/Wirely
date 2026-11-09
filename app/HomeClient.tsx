"use client";

import { useEffect, useReducer, useState, type FormEvent, type MouseEvent } from "react";
import { onAiSettingsChange } from "@/lib/aiSettingsChanged";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";
import {
  DEFAULT_WIRE_MODEL,
  WIRE_MODEL_OPTIONS,
  WIRE_MODEL_PROVIDER_LABEL,
  getWireModelProvider,
  resolveRunnableWireModel,
  type WireModelName,
} from "@/lib/wireModels";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ProjectThumbnail from "@/components/ProjectThumbnail";
import ProjectsSidebar, { type ConnectedAgent } from "@/components/ProjectsSidebar";
import { timeAgo } from "@/lib/timeAgo";
import { toast } from "@/components/ui/sonner";
import McpConnectSteps from "@/components/McpConnectSteps";

// The model picker and delete dialog only matter once the user interacts with
// them, so they load on demand instead of weighing down the first paint.
const ModelPicker = dynamic(() => import("./ModelPicker"), {
  ssr: false,
  loading: () => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled
      className="pointer-events-none text-muted-foreground"
    >
      <span className="h-4 w-28 animate-pulse rounded bg-muted" />
    </Button>
  ),
});

const DeleteProjectDialog = dynamic(() => import("./DeleteProjectDialog"));
const RenameProjectDialog = dynamic(() => import("./RenameProjectDialog"));

// Shown once an agent is connected, so the first thing to paste is obvious.
const AGENT_EXAMPLE_PROMPT =
  "Use Wirely to design three different layouts for a habit tracker dashboard.";

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
  // Total active projects, which can exceed the capped historyItems list.
  historyTotal: number;
  initialPrompt: string;
  enabledModelIds: WireModelName[];
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
  // Agents whose MCP token has made a call, newest first.
  agents: ConnectedAgent[];
}

const PROJECT_SORTS = {
  edited: "Last edited",
  created: "Date created",
  title: "Name",
} as const;

type ProjectSort = keyof typeof PROJECT_SORTS;

const sortProjects = (
  projects: HomeClientInitialData["historyItems"],
  sort: ProjectSort,
) =>
  [...projects].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    const key = sort === "created" ? "createdAt" : "updatedAt";
    return new Date(b[key]).getTime() - new Date(a[key]).getTime();
  });

export type HomeGenerationMode =
  | "single_page"
  | "concept_variants"
  | "information_architecture";

interface HomeState {
  prompt: string;
  isSubmitting: boolean;
  user: HomeClientInitialData["user"];
  errorMessage: string | null;
  historyItems: HomeClientInitialData["historyItems"];
  historyTotal: number;
  selectedModel: WireModelName;
  enabledModelIds: WireModelName[];
  hasGoogleApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  hasZaiApiKey: boolean;
  // null means Wirely reads the brief and decides.
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
  historyTotal: initialData.historyTotal,
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
        historyTotal: Math.max(state.historyTotal - 1, 0),
      };
    default:
      return state;
  }
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

  // A key or model changed in the settings modal over this page applies at once.
  useEffect(
    () =>
      onAiSettingsChange((change) =>
        dispatch({
          type: "patch",
          payload: {
            enabledModelIds: change.enabledModelIds,
            hasGoogleApiKey: change.hasGoogleApiKey,
            hasOpenRouterApiKey: change.hasOpenRouterApiKey,
            hasZaiApiKey: change.hasZaiApiKey,
          },
        }),
      ),
    [],
  );
  const { ref: promptTextareaRef, resize: resizePromptTextarea } =
    useAutoGrowTextarea({ value: state.prompt, minRows: 4 });

  const enabledModelOptions = WIRE_MODEL_OPTIONS.filter((model) =>
    state.enabledModelIds.includes(model.id),
  );
  const pickerModels = enabledModelOptions;

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
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.isSubmitting) return;

    if (!state.user) {
      toast.error("Sign in to generate designs.");
      router.push("/login?next=/projects");
      return;
    }

    // The muted notice under the prompt already points to Models.
    if (state.enabledModelIds.length === 0) return;
    if (selectedModelRequiresMissingKey) {
      const selectedModelProviderLabel =
        WIRE_MODEL_PROVIDER_LABEL[activeSelectedModelProvider];
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
        // Name the project with the model the user picked, on their key.
        body: JSON.stringify({ prompt: trimmedPrompt, model: activeSelectedModel }),
      });

      if (response.status === 401) {
        dispatch({ type: "patch", payload: { isSubmitting: false } });
        router.push("/login?next=/projects");
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

  const composerDisabled =
    state.isSubmitting || hasNoEnabledModels || hasNoRunnableModels;
  // The composer spends a provider key. Without one, the agent is the only way
  // to generate, so home leads with connecting it instead of a dead text box.
  const showComposer = !hasNoRunnableModels;
  const hasConnectedAgent = initialData.agents.length > 0;
  const [sort, setSort] = useState<ProjectSort>("edited");
  const [projectToRename, setProjectToRename] = useState<{ id: string; title: string } | null>(null);
  const projects = sortProjects(state.historyItems, sort);

  const [isCreatingBlank, setIsCreatingBlank] = useState(false);

  // An explicit title skips the title model, so a blank canvas costs no call.
  const createBlankProject = async () => {
    if (isCreatingBlank) return;
    setIsCreatingBlank(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled project" }),
      });
      const payload = (await response.json()) as { project?: { id?: string } };
      if (!response.ok || !payload.project?.id) throw new Error("Could not create a project.");
      router.push(`/wire/${payload.project.id}`);
    } catch {
      toast.error("Could not create a project. Please try again.");
      setIsCreatingBlank(false);
    }
  };

  const copyAgentExample = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_EXAMPLE_PROMPT);
      toast.success("Copied. Paste it into your agent.");
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  };

  const setup = (
    <section className="w-full max-w-2xl">
      {showComposer ? (
        <>
          <h2 className="text-sm font-medium text-foreground">Generate with your own key</h2>
              <form onSubmit={handleSubmit} className="mt-4 text-left">
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
                    ref={promptTextareaRef}
                    onInput={resizePromptTextarea}
                    placeholder="A booking page for a two-chair barbershop, dark, with a weekly calendar..."
                    rows={4}
                    className="w-full resize-none bg-transparent px-4 py-3.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ModelPicker
                        label={selectedModelLabel}
                        disabled={hasNoEnabledModels}
                        showApiKeyWarning={showApiKeyWarning}
                        showConfigureApiKeysCta={showConfigureApiKeysCta}
                        models={pickerModels}
                        onSelectModel={(modelId) =>
                          dispatch({
                            type: "patch",
                            payload: { selectedModel: modelId },
                          })
                        }
                        onOpenProviders={() => router.push("/setting?tab=providers")}
                      />
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
        </>
      ) : null}

      {hasConnectedAgent && !showComposer ? (
        <div className="rounded-xl border border-border bg-card px-5 py-4 text-left">
          <p className="text-sm text-muted-foreground">
            Your agent is connected. Ask it to design something, and the project
            shows up here.
          </p>
          <button
            type="button"
            onClick={copyAgentExample}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-left font-mono text-xs text-foreground transition-colors hover:border-foreground/25"
          >
            {AGENT_EXAMPLE_PROMPT}
          </button>
        </div>
      ) : null}

      {hasConnectedAgent ? null : (
        <div className="mt-8 rounded-xl border border-border bg-card px-5 py-4 text-left">
          <p className="mb-3 text-sm font-medium text-foreground">Connect your coding agent</p>
          <McpConnectSteps />
          <p className="mt-3 text-xs text-muted-foreground">
            Manage or revoke connections in{" "}
            <Link
              href="/setting?tab=mcp"
              className="text-primary underline underline-offset-2"
            >
              settings
            </Link>
            .
          </p>
        </div>
      )}

      {showComposer ? null : (
        <p className="mt-5 text-sm text-muted-foreground">
          To generate here instead, set up your own key in{" "}
          <Link
            href={hasNoEnabledModels ? "/setting?tab=models" : "/setting?tab=providers"}
            className="text-primary underline underline-offset-2"
          >
            {hasNoEnabledModels ? "Models" : "Providers"}
          </Link>
          .
        </p>
      )}

      {state.errorMessage ? (
        <p className="mt-4 text-sm text-destructive">{state.errorMessage}</p>
      ) : null}
    </section>
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <ProjectsSidebar user={state.user} agents={initialData.agents} />

      <div className="min-w-0 flex-1">
        <div className="px-4 pt-3 md:hidden">
          <AppHeader
            user={state.user}
            onLogout={handleLogout}
            isLoggingOut={state.isLoggingOut}
          />
        </div>

        <main className="w-full px-4 pb-28 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 md:h-14 md:pt-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[15px] font-medium text-foreground">All projects</h1>
              {state.historyTotal > state.historyItems.length ? (
                <span className="text-xs text-muted-foreground">
                  Latest {state.historyItems.length} of {state.historyTotal}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    {PROJECT_SORTS[sort]}
                    <ChevronDown className="text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(value) => setSort(value as ProjectSort)}
                  >
                    {Object.entries(PROJECT_SORTS).map(([value, label]) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                size="sm"
                onClick={createBlankProject}
                disabled={isCreatingBlank}
              >
                {isCreatingBlank ? <Loader2 className="animate-spin" /> : <Plus />}
                New project
              </Button>
            </div>
          </div>

          <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-5">
            {projects.map((project) => (
              <li key={project.id} className="group relative">
                <Link
                  href={`/wire/${project.id}`}
                  className="block overflow-hidden rounded-xl border border-border bg-card transition-[border-color,transform] duration-200 hover:border-foreground/20 active:scale-[0.99]"
                >
                  <ProjectThumbnail projectId={project.id} />
                  <div className="border-t border-border px-4 py-3">
                    <p className="truncate pr-8 text-sm font-medium text-foreground">
                      {project.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Edited {timeAgo(project.updatedAt)}
                    </p>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Actions for ${project.title}`}
                      className="absolute bottom-4 right-3 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setProjectToRename({ id: project.id, title: project.title })}
                    >
                      <Pencil size={16} />
                      Rename
                    </DropdownMenuItem>
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

            <li>
              <button
                type="button"
                onClick={createBlankProject}
                disabled={isCreatingBlank}
                className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border text-muted-foreground transition-[border-color,color,transform] duration-200 hover:border-foreground/30 hover:text-foreground active:scale-[0.99] disabled:opacity-60"
              >
                <span className="flex size-8 items-center justify-center rounded-full border border-border bg-card">
                  {isCreatingBlank ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </span>
                <span className="text-sm">New project</span>
              </button>
            </li>
          </ul>

          <div className="pt-14">{setup}</div>
        </main>
      </div>

      {projectToRename ? (
        <RenameProjectDialog
          project={projectToRename}
          onClose={() => setProjectToRename(null)}
          onRenamed={(title) =>
            dispatch({
              type: "patch",
              payload: {
                historyItems: state.historyItems.map((project) =>
                  project.id === projectToRename.id ? { ...project, title } : project,
                ),
              },
            })
          }
        />
      ) : null}

      {state.projectToDelete ? (
        <DeleteProjectDialog
          onCancel={() => dispatch({ type: "closeDeleteDialog" })}
          onConfirm={confirmDeleteProject}
        />
      ) : null}
    </div>
  );
}
