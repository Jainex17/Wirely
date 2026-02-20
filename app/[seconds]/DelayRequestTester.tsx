"use client";

import { useEffect, useState } from "react";

type DelayRequestTesterProps = {
  seconds: number;
};

type Status = "pending" | "done" | "error";

export default function DelayRequestTester({ seconds }: DelayRequestTesterProps) {
  const [status, setStatus] = useState<Status>("pending");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      const startedAt = performance.now();

      try {
        const response = await fetch(`/api/delay/${seconds}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        await response.json();

        if (!isCancelled) {
          setDurationMs(Math.round(performance.now() - startedAt));
          setStatus("done");
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : "Unknown error";
          setErrorMessage(message);
          setDurationMs(Math.round(performance.now() - startedAt));
          setStatus("error");
        }
      }
    };

    void run();

    return () => {
      isCancelled = true;
    };
  }, [seconds]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">Backend Delay Request Test</h1>
      <p className="text-muted-foreground">
        Page loaded instantly. Running <code>GET /api/delay/{seconds}</code>.
      </p>

      {status === "pending" ? (
        <p>Request in progress for {seconds}s target...</p>
      ) : null}

      {status === "done" ? (
        <p>
          Completed in <strong>{durationMs}ms</strong>.
        </p>
      ) : null}

      {status === "error" ? (
        <p>
          Failed after <strong>{durationMs}ms</strong>: {errorMessage}
        </p>
      ) : null}
    </main>
  );
}
