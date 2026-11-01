import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import { REPO_URL } from "@/lib/site";
import DocsNav from "../DocsNav";

export const metadata: Metadata = {
  title: "Run Wirely yourself | Wirely",
  description:
    "Run your own copy of Wirely with Bun, a Postgres database, and a Clerk app, then point your coding agent at it.",
  alternates: { canonical: "/docs/self-host" },
};

export default function SelfHostDocsPage() {
  return (
    <SitePage
      title="Run it yourself"
      nav={<DocsNav current="/docs/self-host" />}
      intro={
        <p>
          Wirely is MIT licensed. You can run your own copy and point your agent at it instead
          of wirely.site.
        </p>
      }
    >
      <h2>What you need</h2>
      <ul>
        <li>
          <a href="https://bun.sh">Bun</a>.
        </li>
        <li>A Postgres database. A free Neon database works.</li>
        <li>
          A <a href="https://clerk.com">Clerk</a> app for sign in.
        </li>
      </ul>

      <h2>Install</h2>
      <pre>{`git clone ${REPO_URL}.git
cd Wirely
bun install
cp .env.example .env.local`}</pre>

      <h2>Fill in .env.local</h2>
      <ul>
        <li>
          <code>DATABASE_URL</code> is the connection string of your Postgres database.
        </li>
        <li>
          <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> come
          from your Clerk app.
        </li>
        <li>
          <code>USER_API_KEY_MASTER_SECRET_BASE64</code> encrypts the provider keys users save.
          Create one with <code>openssl rand -base64 32</code> and keep it. Losing it makes every
          saved key unreadable.
        </li>
      </ul>
      <p>
        Provider keys for generating inside Wirely are not environment variables. Each user
        saves their own in settings.
      </p>

      <h2>Create the tables and start</h2>
      <pre>{`bun run db:migrate
bun run dev`}</pre>
      <p>
        <code>db:migrate</code> applies to whatever <code>DATABASE_URL</code> names, so check it
        points at the database you mean. Then open <code>http://localhost:3000</code> and sign
        in.
      </p>

      <h2>Connect your agent to your copy</h2>
      <p>
        Use the steps on <Link href="/docs">Connect your agent</Link> with the server URL{" "}
        <code>http://localhost:3000/api/mcp</code>. For Claude Code:
      </p>
      <pre>claude mcp add --transport http wirely http://localhost:3000/api/mcp</pre>

      <h2>Contribute</h2>
      <p>
        Fork the <a href={REPO_URL}>repository</a>, make your change on a branch, run{" "}
        <code>bun run lint</code> and <code>bun run test</code>, and open a pull request.
      </p>
    </SitePage>
  );
}
