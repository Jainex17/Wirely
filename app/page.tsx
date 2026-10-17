import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/session";
import Landing from "./Landing";

/** The marketing page. A signed-in visitor is sent on to their projects. */
export default async function Home() {
  const user = await getServerSessionUser();
  if (user) redirect("/projects");
  return <Landing />;
}
