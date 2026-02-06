import WireEditor from "./WireEditor";

interface WirePageProps {
  params: Promise<{ id: string }>;
}

export default async function WirePage({ params }: WirePageProps) {
  const resolvedParams = await params;
  return <WireEditor wireId={resolvedParams.id} />;
}
