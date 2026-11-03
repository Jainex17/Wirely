import Link from "next/link";

import BlogPost, { blogPostMetadata } from "../BlogPost";

export const metadata = blogPostMetadata("clickable-prototype");

export default function ClickablePrototypePost() {
  return (
    <BlogPost slug="clickable-prototype">
      <p>
        A pricing page can look right on its own and still lead nowhere. You find that out when
        you click &quot;Choose Pro&quot; and there is no checkout. Wirely lets you wire the pages
        on your canvas together and click through them before anyone builds them.
      </p>

      <h2>Link an element by hand</h2>
      <ol>
        <li>Click the button, link, or card that should open another screen.</li>
        <li>
          In the inspector&apos;s <strong>Prototype</strong> section, pick the page it opens.
          You can also pick <strong>Back to previous screen</strong>, or{" "}
          <strong>Close overlay</strong> for an element inside an overlay.
        </li>
        <li>
          Choose <strong>Navigate</strong> to replace the screen, or <strong>Overlay</strong> to
          open the page on top of it, for a dialog or a menu.
        </li>
        <li>
          A navigation can be instant, dissolve, or slide left or right. An overlay always opens
          without a transition.
        </li>
      </ol>
      <p>Each link is an edit like any other, so Cmd+Z undoes it.</p>

      <h2>Or ask your agent</h2>
      <p>
        Tell your agent to link the screens, for example &quot;make Choose Pro open the checkout
        page with a slide&quot;. It calls <code>link_element</code> on that element and gives
        you the play link back. To remove a link, ask the agent to unlink it, or press{" "}
        <strong>Remove link</strong> in the inspector.
      </p>

      <h2>Play it</h2>
      <p>
        Press <strong>Play</strong> in the editor to open the play view. Click through the
        screens the way a user would. <strong>Back</strong> returns to the screen you came from,
        a switch shows the desktop or mobile version, and presenting fills the screen.
      </p>
      <p>
        To step through screens with the arrow keys in a set order, ask your agent for a screen
        order. It saves one with <code>set_prototype_flow</code>, and you can change the order
        by asking again.
      </p>

      <h2>Then build it</h2>
      <p>
        The links are attributes on the page&apos;s HTML, so when your agent builds the pages
        in your codebase, it can read where each element leads.{" "}
        <Link href="/blog/build-check">Checking a build against its design</Link> covers what
        happens next.
      </p>
    </BlogPost>
  );
}
