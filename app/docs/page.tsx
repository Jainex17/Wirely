import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";
import { buildConnectSnippet, MCP_CLIENTS } from "@/lib/mcp/connectSnippet";

export const metadata: Metadata = {
  title: "Connect your coding agent | Wirely",
  description:
    "Add the Wirely MCP server to Claude Code, Cursor, Codex, opencode, or any MCP client, then ask your agent to design screens on the Wirely canvas.",
  alternates: { canonical: "/docs" },
};

const SERVER_URL = `${CANONICAL_APP_ORIGIN}/api/mcp`;

// The same snippets home and settings show, built for the production URL and
// the OAuth flow, so this page cannot drift from what the app hands out.
const CLIENT_STEPS = MCP_CLIENTS.map((client) => ({
  ...client,
  steps: buildConnectSnippet(client.id, SERVER_URL),
}));

export default function DocsPage() {
  return (
    <SitePage
      title="Connect your coding agent"
      intro={
        <p>
          Wirely is an MCP server. Add it to your agent once, and the agent can create projects
          and write pages onto your Wirely canvas while you watch.
        </p>
      }
    >
      <h2>Before you start</h2>
      <ul>
        <li>
          <Link href="/login">Sign in to Wirely</Link>. Your projects belong to this account.
        </li>
        <li>
          The server URL is <code>{SERVER_URL}</code>.
        </li>
        <li>
          Your agent signs in through your browser the first time it calls Wirely. You click
          Authorize, and there is no token to copy.
        </li>
      </ul>

      {CLIENT_STEPS.map(({ id, label, steps }) => (
        <section key={id}>
          <h2>{label}</h2>
          {steps.installUrl ? (
            <p>
              <a href={steps.installUrl}>Add Wirely to Cursor</a> with one click.
            </p>
          ) : null}
          <p>{steps.target}:</p>
          <pre>{steps.snippet}</pre>
          <p>{steps.next}</p>
        </section>
      ))}

      <h2>Other MCP clients</h2>
      <p>
        Any client that supports remote MCP servers over streamable HTTP works. Add a server
        named <code>wirely</code> with the URL <code>{SERVER_URL}</code>. A client that supports
        MCP OAuth opens the Authorize page on its own.
      </p>

      <h2>Clients that cannot open a browser</h2>
      <p>
        Some clients, such as an agent on a remote machine, cannot finish the browser sign in.
        Use a token instead:
      </p>
      <ol>
        <li>
          Open <Link href="/setting?tab=mcp">Settings, MCP</Link>, or the connect card on the
          home page.
        </li>
        <li>
          Under <strong>Client can&apos;t open a browser?</strong>, click{" "}
          <strong>Use a token</strong>. Wirely shows the token once, so copy it right away.
        </li>
        <li>
          Use the snippet shown next to it. It sends the token as a header:{" "}
          <code>Authorization: Bearer wirely_…</code>
        </li>
      </ol>

      <h2>Check that it works</h2>
      <p>Restart your agent, then ask it something like:</p>
      <pre>Design three different layouts for a habit tracker in Wirely.</pre>
      <p>
        The project shows up on your Wirely home page and fills in as the agent writes. The
        client also appears under <strong>Connected clients</strong> in Settings, MCP, with the
        time it last called Wirely.
      </p>

      <h2>What to ask your agent</h2>
      <ul>
        <li>Ask for several directions of one screen, then compare them on the canvas.</li>
        <li>
          Pick an element on the canvas, copy its link, and paste it to your agent with the
          change you want. The agent edits that element and leaves the rest of the page alone.
        </li>
        <li>Ask it to fix the review comments on a project. It reads them and resolves each one.</li>
        <li>Ask it to link pages into a clickable prototype, then press Play.</li>
        <li>When you pick a page, ask the agent to build it in your codebase.</li>
      </ul>

      <h2>Troubleshooting</h2>
      <ul>
        <li>
          <strong>The agent does not list any Wirely tools.</strong> Restart the agent after
          adding the server. Most clients read their MCP config only at startup.
        </li>
        <li>
          <strong>Calls fail with 401.</strong> The client&apos;s access was revoked in Settings,
          or it never finished signing in. Run the client&apos;s authenticate step again, or
          create a new token.
        </li>
        <li>
          <strong>Pages land in a project you did not expect.</strong> The agent reuses a project
          with a matching name. Tell it which project to use, or to create a new one.
        </li>
      </ul>

      <h2>Disconnect a client</h2>
      <p>
        Open <Link href="/setting?tab=mcp">Settings, MCP</Link> and click Revoke next to the
        client. Its next call fails, and you can remove the server from the client&apos;s
        config.
      </p>
    </SitePage>
  );
}
