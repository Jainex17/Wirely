import WireEditor from "./WireEditor";

interface WirePageProps {
  params: { id: string };
  searchParams?: { prompt?: string | string[] };
}

export default function WirePage({ params, searchParams }: WirePageProps) {
  const promptValue = Array.isArray(searchParams?.prompt)
    ? searchParams?.prompt[0]
    : searchParams?.prompt;

  return <WireEditor wireId={params.id} prompt={promptValue} />;
}
