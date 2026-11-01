import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import { REPO_URL } from "@/lib/site";
import DocsNav from "../DocsNav";

export const metadata: Metadata = {
  title: "Security | Wirely",
  description:
    "How Wirely sandboxes the pages your agent writes, stores your provider keys, and runs the build check on your machine.",
  alternates: { canonical: "/docs/security" },
};

export default function SecurityDocsPage() {
  return (
    <SitePage
      title="Security"
      nav={<DocsNav current="/docs/security" />}
      intro={
        <p>
          A model writes every page on your canvas, so Wirely treats that HTML as untrusted. This
          page explains how. The <a href={REPO_URL}>source</a> has the code behind each point.
        </p>
      }
    >
      <h2>Pages run in a sandbox</h2>
      <ul>
        <li>
          Each page renders in an iframe with <code>sandbox=&quot;allow-scripts&quot;</code> and
          without <code>allow-same-origin</code>. A page cannot read your Wirely session or call
          Wirely as you.
        </li>
        <li>
          Before a page renders, Wirely removes disallowed tags and adds a strict Content
          Security Policy. Scripts load only from a short list of CDNs, and images only from a
          short list of hosts.
        </li>
        <li>
          Wirely never runs your codebase. It does load page HTML in a headless Chrome on its
          servers to take screenshots for <code>get_page_png</code>. That render sanitizes the
          page first and keeps the same Content Security Policy, so scripts still load only from
          the allowed CDNs.
        </li>
      </ul>

      <h2>Your keys</h2>
      <ul>
        <li>
          Provider keys you save in settings are encrypted with AES-256-GCM, bound to your
          account. Wirely decrypts a key only to make a request you asked for.
        </li>
        <li>Agent tokens and OAuth codes are stored as SHA-256 hashes.</li>
        <li>Wirely&apos;s logs strip keys, tokens, prompts, and page HTML.</li>
      </ul>

      <h2>Agent access</h2>
      <p>
        Your agent signs in through your browser, and you approve it on an Authorize page. It
        can reach only your projects. Revoke a client at any time in{" "}
        <Link href="/setting?tab=mcp">Settings, MCP</Link>.
      </p>

      <h2>The build check</h2>
      <p>
        The build check is the one time Wirely hands your agent a script to run. Your agent
        downloads it from <code>/api/capture/script</code> and runs it on your machine.
      </p>
      <ul>
        <li>
          It opens your app in a headless copy of your own Chrome with a fresh profile. It
          carries no cookies unless you pass one with <code>--cookie</code>.
        </li>
        <li>
          It uploads the page to a link that only writes to that one project and expires after
          an hour.
        </li>
      </ul>

      <h2>Report a problem</h2>
      <p>
        Found a security issue? Open an issue on <a href={`${REPO_URL}/issues`}>GitHub</a>{" "}
        without the details, and ask for a private way to send them.
      </p>
    </SitePage>
  );
}
