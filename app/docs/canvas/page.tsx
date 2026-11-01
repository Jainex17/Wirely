import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import DocsNav from "../DocsNav";

export const metadata: Metadata = {
  title: "Use the canvas | Wirely",
  description:
    "Compare the pages your agent writes, edit elements by hand, send one element back to your agent, link pages into a prototype, collect comments, and export.",
  alternates: { canonical: "/docs/canvas" },
};

export default function CanvasDocsPage() {
  return (
    <SitePage
      title="Use the canvas"
      nav={<DocsNav current="/docs/canvas" />}
      intro={
        <p>
          Every project opens on a canvas you can pan and zoom. Your agent writes pages onto it,
          and you compare them, change them, and pick the one to build.
        </p>
      }
    >
      <h2>Pages</h2>
      <p>
        Every page on the canvas is HTML that your agent wrote. Each one has a desktop or mobile
        frame, and you edit it directly on the canvas.
      </p>

      <h2>Compare directions</h2>
      <p>
        Ask your agent for several layouts of one screen. They land next to each other as they
        are written. To look closer, open a page&apos;s menu and pick <strong>Compare</strong>.
        You can see two pages side by side, overlaid, or as a difference where everything that
        matches turns black.
      </p>

      <h2>Edit by hand</h2>
      <ul>
        <li>Click any element to change its text, colors, size, spacing, radius, and shadow.</li>
        <li>Drag to reorder, drag the handles to resize, and double-click text to type into it.</li>
        <li>Moves snap to nearby edges and centers. Hold Alt to see distances.</li>
        <li>
          Open a page in the pages panel to see its layers. You can hide, nest, duplicate, and
          delete them there.
        </li>
        <li>The frame, rectangle, and text tools add new elements. Cmd+Z undoes any change.</li>
        <li>The pen tool draws on any page and edits shapes on vector pages.</li>
        <li>A page&apos;s history lists earlier versions you can go back to.</li>
      </ul>

      <h2>Send one element to your agent</h2>
      <p>
        Pick an element and copy its link. Paste the link into your agent with the change you
        want. The agent edits that element and leaves the rest of the page alone.
      </p>
      <p>
        If you changed a page by hand, your agent can ask what changed since it last wrote the
        page, so it does not overwrite your edits.
      </p>

      <h2>Build a prototype</h2>
      <p>
        Link pages together by hand or ask your agent to do it. Press <strong>Play</strong> to
        click through them, or present them full screen.
      </p>

      <h2>Collect feedback</h2>
      <p>
        Press C and click any element to pin a comment. Send a review link so other people can
        pin comments too. They sign in to Wirely to open it. Ask your agent to fix the comments
        on a project, and it reads and resolves each one.
      </p>

      <h2>Use your own images</h2>
      <p>
        Upload images to the project&apos;s Assets folder, or ask your agent to upload one from
        your disk.
      </p>

      <h2>Check the build against the design</h2>
      <p>
        After your agent builds a page in your codebase, it can capture that page from your
        running app. Wirely sends back what differs from the design: missing or reworded copy,
        fonts, sizes, colors, and the areas whose pixels differ most. The agent fixes them and
        checks again. <Link href="/docs/security">Security</Link> explains what the capture
        script does on your machine.
      </p>

      <h2>Export</h2>
      <p>
        Copy a page as an image, HTML, or SVG. Download it as a PNG at 2x or 3x, or as a PDF.
      </p>
    </SitePage>
  );
}
