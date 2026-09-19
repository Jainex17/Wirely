import type { Metadata } from "next";
import { getServerSessionUser } from "@/lib/auth/session";
import { listProjectsForUser } from "@/lib/db/queries/projects";
import { getUserAiSettings } from "@/lib/db/queries/users";
import { DEFAULT_ENABLED_WIRE_MODELS } from "@/lib/wireModels";
import { inferGenerationMode } from "@/lib/inferGenerationMode";
import HomeClient, { type HomeGenerationMode } from "./HomeClient";
import Landing from "./Landing";

export const metadata: Metadata = {
  title: "Wirely",
  description: "Turn a prompt into editable web pages you own.",
};

const MAX_DRAFT_PROMPT_LENGTH = 500;

const GENERATION_MODES: HomeGenerationMode[] = [
  "single_page",
  "concept_variants",
  "information_architecture",
];

const toGenerationMode = (
  value: string | undefined,
  draftPrompt: string,
): HomeGenerationMode =>
  GENERATION_MODES.find((mode) => mode === value) ?? inferGenerationMode(draftPrompt);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; mode?: string }>;
}) {
  const [{ prompt, mode }, sessionUser] = await Promise.all([
    searchParams,
    getServerSessionUser(),
  ]);

  if (!sessionUser) {
    return <Landing />;
  }

  const [projects, aiSettings] = await Promise.all([
    listProjectsForUser(sessionUser.id),
    getUserAiSettings(sessionUser.id),
  ]);

  const draftPrompt =
    typeof prompt === "string" ? prompt.slice(0, MAX_DRAFT_PROMPT_LENGTH) : "";

  return (
    <HomeClient
      initialData={{
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.name,
          avatarUrl: sessionUser.avatarUrl,
        },
        historyItems: projects,
        initialPrompt: draftPrompt,
        initialMode: toGenerationMode(mode, draftPrompt),
        enabledModelIds:
          aiSettings?.enabledModelIds ?? [...DEFAULT_ENABLED_WIRE_MODELS],
        hasGoogleApiKey: aiSettings?.hasGoogleApiKey ?? true,
        hasOpenRouterApiKey: aiSettings?.hasOpenRouterApiKey ?? true,
        hasZaiApiKey: aiSettings?.hasZaiApiKey ?? true,
      }}
    />
  );
}
