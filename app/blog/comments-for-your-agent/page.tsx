import Link from "next/link";

import BlogPost, { blogPostMetadata } from "../BlogPost";

export const metadata = blogPostMetadata("comments-for-your-agent");

export default function CommentsForYourAgentPost() {
  return (
    <BlogPost slug="comments-for-your-agent">
      <p>
        Feedback on a design usually arrives as a list in a chat thread: &quot;the second
        headline is too long&quot;, &quot;make yearly the default&quot;. Someone then has to
        work out which element each line means and pass it on. In Wirely the comment sits on
        the element it is about, and your agent reads it from there.
      </p>

      <h2>Pin a comment</h2>
      <p>
        Press C and click any element on a page to pin a comment to it. The Comments panel
        opens in the right sidebar and lists every open comment, grouped by page. Click one to
        jump to its pin.
      </p>

      <h2>Ask other people</h2>
      <p>
        Press <strong>Share</strong>, then <strong>Create review link</strong>, and send the
        link. Anyone signed in to Wirely who opens it sees every page and can pin comments, and
        those comments show up on your canvas next to yours. <strong>Turn off link</strong>{" "}
        stops it working and keeps the comments. Turning it on again makes a new link.
      </p>

      <h2>Hand the comments to your agent</h2>
      <p>
        Tell your agent to fix the comments on the project. It calls <code>list_comments</code>,
        which returns each open comment with its page, author, text, and pin position. A
        comment pinned to an element also carries that element&apos;s id. Then, for each
        comment, the agent:
      </p>
      <ol>
        <li>
          Reads that element with <code>get_page</code>, or renders the page with{" "}
          <code>get_page_png</code> to see what the pin points at.
        </li>
        <li>Makes the change on the page.</li>
        <li>
          Calls <code>resolve_comment</code> to mark the comment done, and its pin leaves the
          canvas.
        </li>
      </ol>
      <p>
        Wirely tells the agent to leave a comment open when it could not do what the comment
        asks, and to tell you why.
      </p>

      <h2>Undo a resolve</h2>
      <p>
        Tick <strong>Show resolved</strong> in the Comments panel to see resolved comments
        again. Reopen one from there, or ask your agent to, and its pin comes back.
      </p>

      <p>
        <Link href="/docs/canvas">Use the canvas</Link> covers comments with the rest of the
        editor.
      </p>
    </BlogPost>
  );
}
