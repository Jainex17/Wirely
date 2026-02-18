"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("app_global_error_boundary", { error, digest: error.digest });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground">
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-lg rounded-lg border border-border bg-card p-6 text-center">
            <h1 className="text-xl font-semibold">Critical error</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A critical application error occurred. Try resetting the error or
              reloading the app.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => reset()}>
                Reset
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
      </body>
    </html>
  );
}

