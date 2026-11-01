import Link from "next/link";

import BlogPost, { blogPostMetadata } from "../BlogPost";

export const metadata = blogPostMetadata("build-check");

export default function BuildCheckPost() {
  return (
    <BlogPost slug="build-check">
      <p>
        Picking a design is half the job. The other half is getting your app to look like it.
        An agent that builds from a screenshot guesses at spacing, font sizes, and colors, and
        the guesses add up. Wirely closes that gap with a build check.
      </p>

      <h2>How it works</h2>
      <ol>
        <li>You pick a page on the canvas and ask your agent to build it in your codebase.</li>
        <li>
          The agent reads the HTML it wrote for that page, so it starts from the real values
          instead of a picture.
        </li>
        <li>
          Once the page runs locally, the agent calls <code>capture_local_page</code>. Wirely
          hands back a short command and a signed upload link.
        </li>
        <li>
          The agent runs the command. It opens your page in a headless copy of your own Chrome,
          measures it, and uploads the result to that project.
        </li>
        <li>
          Wirely renders the design page, measures it the same way, and answers with a report
          and a diff image.
        </li>
      </ol>

      <h2>What the report says</h2>
      <p>The report lists what differs between the design and your build:</p>
      <ul>
        <li>Copy that is missing or reworded.</li>
        <li>Fonts, sizes, and colors that do not match.</li>
        <li>The areas where the pixels differ most.</li>
      </ul>
      <p>
        The agent fixes what the report names and captures again. The upload link lasts an
        hour, which is enough for a few rounds without asking for a new one.
      </p>

      <h2>What you see</h2>
      <p>
        The capture lands on the canvas as a page next to the design. Open either page&apos;s
        menu and pick <strong>Compare</strong> to see them side by side, overlaid, or as a
        difference where everything that matches turns black. Wirely does not store the report
        itself. It goes to the agent, and the two pages stay on your canvas.
      </p>

      <h2>What runs on your machine</h2>
      <p>
        The capture script is the one thing Wirely asks your agent to run. It uses a fresh
        Chrome profile, so it carries no cookies unless you pass one with{" "}
        <code>--cookie</code>, and its link can only write to one project.{" "}
        <Link href="/docs/security">Security</Link> has the details.
      </p>

      <h2>Without a design page</h2>
      <p>
        A capture does not need a design to compare against. Point it at any localhost page and
        it lands on the canvas, where you can mark it up and ask your agent for directions from
        there.
      </p>
    </BlogPost>
  );
}
