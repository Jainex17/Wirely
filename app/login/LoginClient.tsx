"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { toast } from "@/components/ui/sonner";

interface LoginClientProps {
  nextPath?: string;
}

export default function LoginClient({ nextPath }: LoginClientProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setLoginError = (message: string) => {
    setErrorMessage(message);
    toast.error(message);
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: nextPath || "/",
      });

      if (result.error) {
        setLoginError(result.error.message || "Unable to sign in with Google.");
      }
    } catch {
      setLoginError("Unable to sign in with Google.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Wirely
          </p>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Continue with Google to access your projects.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
          >
            {isLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <p className="text-sm text-muted-foreground text-center">
            <Link href="/" className="text-primary hover:underline underline-offset-4">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
