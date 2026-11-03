import Link from "next/link";

import BlogPost, { blogPostMetadata } from "../BlogPost";

export const metadata = blogPostMetadata("edit-one-element");

export default function EditOneElementPost() {
  return (
    <BlogPost slug="edit-one-element">
      <p>
        Ask an agent to change one button and it often writes the whole page again. Spacing
        shifts, a headline you liked gets reworded, and you check every section a second time.
        Wirely gives your agent the address of the one element you mean, so the rest of the page
        stays as it was.
      </p>

      <h2>How it works</h2>
      <ol>
        <li>Click the element on the canvas. The inspector opens with its tag and its page.</li>
        <li>
          Press the link button in the inspector&apos;s header. Wirely copies a link that names
          the project, the page, and the element.
        </li>
        <li>Paste the link into your agent and say what you want changed.</li>
        <li>
          The agent calls <code>get_page</code> with that element&apos;s id and gets back its
          exact HTML.
        </li>
        <li>
          It calls <code>patch_page</code> to replace that HTML and nothing else. The canvas
          shows the change as it lands.
        </li>
      </ol>

      <h2>Without a link</h2>
      <p>
        If the element is already selected on the canvas, you can skip the link and say
        &quot;this button&quot; or &quot;the selected heading&quot;. The agent calls{" "}
        <code>get_selection</code>, which returns the element you picked last, and edits it the
        same way.
      </p>

      <h2>Moving things, not only rewording them</h2>
      <p>
        Some changes are about structure: move a card above another, duplicate a row, hide a
        section, or wrap two elements in a new frame. The agent does those with{" "}
        <code>edit_element</code> by element id, without sending the page&apos;s HTML back.
      </p>

      <h2>Your own edits stay</h2>
      <p>
        You can change text, colors, sizes, and spacing by hand on the canvas. Before it writes
        to a page you touched, the agent can call <code>get_page_changes</code> to see what you
        changed since its last write. If you and the agent edit the same page at the same
        moment, Wirely applies the agent&apos;s edit to the latest version of the page instead
        of writing over yours.
      </p>

      <p>
        <Link href="/docs/canvas">Use the canvas</Link> lists the rest of what you can do by
        hand.
      </p>
    </BlogPost>
  );
}
