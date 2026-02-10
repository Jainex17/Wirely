import LoginClient from "./LoginClient";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const { data } = await auth.getSession();
  const user = data?.user ?? null;
  const nextPath =
    typeof resolvedParams.next === "string" &&
    resolvedParams.next.startsWith("/") &&
    resolvedParams.next !== "/login"
      ? resolvedParams.next
      : "/";

  if (user) {
    redirect(nextPath);
  }

  return <LoginClient nextPath={resolvedParams.next} />;
}
