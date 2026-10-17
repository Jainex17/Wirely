import type { Metadata } from "next";
import LoginClient from "./LoginClient";
import { redirect } from "next/navigation";
import { DEFAULT_RETURN_PATH, loginReturnPath } from "@/lib/auth/loginRedirect";
import { getServerSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Login | Wirely",
  description: "Sign in to Wirely to create and manage projects.",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string; redirect_url?: string; prompt?: string }>;
}

const MAX_DRAFT_PROMPT_LENGTH = 500;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const user = await getServerSessionUser();
  const requestedNext = loginReturnPath({
    next: typeof resolvedParams.next === "string" ? resolvedParams.next : undefined,
    redirectUrl:
      typeof resolvedParams.redirect_url === "string" ? resolvedParams.redirect_url : undefined,
  });

  // A draft typed on the landing page rides through sign-in as a query param.
  const draftPrompt =
    requestedNext === DEFAULT_RETURN_PATH && typeof resolvedParams.prompt === "string"
      ? resolvedParams.prompt.trim().slice(0, MAX_DRAFT_PROMPT_LENGTH)
      : "";
  const nextPath = draftPrompt
    ? `${DEFAULT_RETURN_PATH}?prompt=${encodeURIComponent(draftPrompt)}`
    : requestedNext;

  if (user) {
    redirect(nextPath);
  }

  return <LoginClient nextPath={nextPath} />;
}
