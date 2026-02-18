"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("app_error_boundary", { error, digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-lg rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The app hit an unexpected error. Try again or reload the page.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => reset()}>
            Try again
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        </div>
      </div>
    </main>
  );
}

