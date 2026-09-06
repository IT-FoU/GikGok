import { WelcomeView } from "@/components/welcome-view";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const params = await searchParams;
  return <WelcomeView deleted={params.deleted === "1"} />;
}
