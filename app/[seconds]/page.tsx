import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

const ALLOWED_SECONDS = new Set([15, 25, 35, 60, 120]);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ seconds: string }>;
};

export default async function DelayedPage({ params }: PageProps) {
  noStore();

  const { seconds } = await params;
  const delaySeconds = Number.parseInt(seconds, 10);

  if (!ALLOWED_SECONDS.has(delaySeconds)) {
    notFound();
  }

  await wait(delaySeconds * 1000);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">Delayed Page</h1>
      <p className="text-muted-foreground">
        Route <code>/{delaySeconds}</code> responded after {delaySeconds} seconds.
      </p>
    </main>
  );
}
