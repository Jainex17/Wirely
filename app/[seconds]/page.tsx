import { notFound } from "next/navigation";
import DelayRequestTester from "./DelayRequestTester";

const ALLOWED_SECONDS = new Set([15, 25, 35, 60, 120]);

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ seconds: string }>;
};

export default async function DelayedPage({ params }: PageProps) {
  const { seconds } = await params;
  const delaySeconds = Number.parseInt(seconds, 10);

  if (!ALLOWED_SECONDS.has(delaySeconds)) {
    notFound();
  }

  return <DelayRequestTester seconds={delaySeconds} />;
}
