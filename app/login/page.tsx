import type { Metadata } from "next";
import LoginClient from "./LoginClient";
import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Login | Wirely",
  description: "Sign in to Wirely to create and manage projects.",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const user = await getServerSessionUser();
  const nextPath =
    typeof resolvedParams.next === "string" &&
    resolvedParams.next.startsWith("/") &&
    resolvedParams.next !== "/login"
      ? resolvedParams.next
      : "/";

  if (user) {
    redirect(nextPath);
  }

  return <LoginClient nextPath={nextPath} />;
}
