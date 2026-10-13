import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import { CONTACT_URL, REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy | Wirely",
  description: "What Wirely stores about you, who it shares it with, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <SitePage
      title="Privacy policy"
      intro={
        <p>
          Last updated October 13, 2026. This page explains what Wirely stores when you use{" "}
          <Link href="/">wirely.site</Link>, why, and who else sees it. Wirely is open source, so
          you can check every claim here against the <a href={REPO_URL}>source code</a>.
        </p>
      }
    >
      <h2>What Wirely stores</h2>
      <h3>Your account</h3>
      <p>
        Sign in runs through Clerk. Wirely keeps your Clerk user id, email address, name, and
        profile picture URL so it can show who is signed in and tie projects to you.
      </p>
      <h3>Your work</h3>
      <ul>
        <li>Projects, pages, design screens, page history, and prototype flows.</li>
        <li>Images you or your agent upload to a project.</li>
        <li>Comments left on your pages, with the commenter&apos;s account.</li>
        <li>
          If you generate inside Wirely, your prompts, the chat, and a record of each generation
          run and its model.
        </li>
      </ul>
      <h3>Your keys and tokens</h3>
      <ul>
        <li>
          Provider keys you save in settings (Google AI Studio, OpenRouter, Z.ai, Unsplash) are
          encrypted with AES-256-GCM before they are stored. Wirely decrypts a key only to make a
          request you asked for.
        </li>
        <li>
          Agent tokens and OAuth codes are stored as SHA-256 hashes, never in plain text. Wirely
          records when each token was last used.
        </li>
      </ul>
      <h3>Technical data</h3>
      <p>
        Your IP address is used to rate limit requests. The limit lives in server memory and
        is not saved. The host keeps standard request logs. Wirely&apos;s own logs strip keys,
        tokens, prompts, and page HTML before anything is written.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        Clerk sets the cookies that keep you signed in. Wirely sets no advertising or tracking
        cookies. Your browser&apos;s local storage holds canvas layout, such as where frames sit
        and the zoom level.
      </p>

      <h2>Who else sees your data</h2>
      <ul>
        <li>
          <strong>Clerk</strong> handles sign in and holds your account details.
        </li>
        <li>
          <strong>Vercel</strong> hosts the app. Vercel Web Analytics counts page views without
          cookies.
        </li>
        <li>
          <strong>Neon</strong> hosts the Postgres database that stores your work.
        </li>
        <li>
          <strong>Google</strong> receives the first prompt of a new project to write a short
          title for it, on Wirely&apos;s key, when you have not saved a key of your own.
        </li>
        <li>
          <strong>The AI provider you choose</strong> (Google, OpenRouter, or Z.ai) receives your
          prompts and page content when you generate inside Wirely, on your own key and under
          your agreement with them.
        </li>
        <li>
          <strong>Unsplash</strong> receives image search terms when you saved an Unsplash key.
        </li>
        <li>
          <strong>Your coding agent</strong> reads the pages, comments, and images you let it
          reach. What its provider does with that is covered by your agreement with them.
        </li>
        <li>
          <strong>Websites you import.</strong> When you or your agent import a URL, Wirely&apos;s
          server loads that page.
        </li>
        <li>
          <strong>People with a review link</strong> can see the pages of that project and leave
          comments while the link is on.
        </li>
      </ul>
      <p>
        Wirely does not sell your data, show ads, or train models on your work.
      </p>

      <h2>How long it is kept</h2>
      <p>
        Your work stays until you delete it. Deleting a project removes its pages, images,
        comments, and history from the database. Deleting your account removes your projects and
        everything in them. Database backups at the host can hold deleted data for a
        short time after.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Delete a project from the home page at any time.</li>
        <li>Remove a saved key in settings, and revoke an agent&apos;s access in Settings, MCP.</li>
        <li>Export any page as HTML, an image, SVG, or PDF.</li>
        <li>
          To get a copy of your data or delete your account,{" "}
          <a href={CONTACT_URL}>contact the maintainer</a>.
        </li>
      </ul>

      <h2>Children</h2>
      <p>Wirely is not meant for children under 13 and does not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>
        When this policy changes, the date at the top changes too. The full history is in the{" "}
        <a href={REPO_URL}>public repository</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy go to the <a href={CONTACT_URL}>maintainer</a>.
      </p>
    </SitePage>
  );
}
