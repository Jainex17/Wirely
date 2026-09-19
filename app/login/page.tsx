import type { Metadata } from "next";
import LoginClient from "./LoginClient";
import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Login | Wirely",
  description: "Sign in to Wirely to create and manage projects.",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string; prompt?: string; mode?: string }>;
}

const MAX_DRAFT_PROMPT_LENGTH = 500;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const user = await getServerSessionUser();
  const requestedNext =
    typeof resolvedParams.next === "string" &&
    resolvedParams.next.startsWith("/") &&
    resolvedParams.next !== "/login"
      ? resolvedParams.next
      : "/";

  // A draft typed on the landing page rides through sign-in as a query param.
  const draftPrompt =
    requestedNext === "/" && typeof resolvedParams.prompt === "string"
      ? resolvedParams.prompt.trim().slice(0, MAX_DRAFT_PROMPT_LENGTH)
      : "";
  const draftMode =
    requestedNext === "/" && typeof resolvedParams.mode === "string"
      ? resolvedParams.mode.slice(0, 40)
      : "";
  const draftQuery = new URLSearchParams();
  if (draftPrompt) draftQuery.set("prompt", draftPrompt);
  if (draftMode) draftQuery.set("mode", draftMode);
  const nextPath = draftQuery.size > 0 ? `/?${draftQuery}` : requestedNext;

  if (user) {
    redirect(nextPath);
  }

  return <LoginClient nextPath={nextPath} />;
}
