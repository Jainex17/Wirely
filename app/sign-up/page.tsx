import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/app/login/AuthCard";
import { loginReturnPath } from "@/lib/auth/loginRedirect";
import { getServerSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign up | Wirely",
  description: "Create a Wirely account and connect your coding agent.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect_url?: string }>;
}) {
  const { next, redirect_url: redirectUrl } = await searchParams;
  const nextPath = loginReturnPath({
    next: typeof next === "string" ? next : undefined,
    redirectUrl: typeof redirectUrl === "string" ? redirectUrl : undefined,
  });
  if (await getServerSessionUser()) redirect(nextPath);
  return <AuthCard mode="sign-up" nextPath={nextPath} />;
}
