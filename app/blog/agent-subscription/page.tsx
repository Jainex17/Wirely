import Link from "next/link";

import BlogPost, { blogPostMetadata } from "../BlogPost";

export const metadata = blogPostMetadata("agent-subscription");

export default function AgentSubscriptionPost() {
  return (
    <BlogPost slug="agent-subscription">
      <p>
        Most AI design tools sell credits. You pay them for model calls on top of the coding
        agent you already pay for. Wirely skips that. Your agent does the design work, and
        Wirely is the canvas it draws on.
      </p>

      <h2>The agent already knows how to write a page</h2>
      <p>
        Claude Code, Cursor, and Codex write HTML and CSS well. What they lack is a place to
        put several screens next to each other, a way for you to point at one element, and a
        way to hand the winner back. Wirely is an MCP server that adds those. The agent calls{" "}
        <code>add_page</code>, the page lands on your canvas, and you watch it fill in.
      </p>

      <h2>What this costs Wirely</h2>
      <p>
        Storage, and a render now and then when your agent asks for a picture of a page to
        check its work. No model call runs on a Wirely key, so there is no bill to pass on to
        you. That is why there are no plans, no credits, and no cap on agent calls.
      </p>

      <h2>What it costs you</h2>
      <p>
        Nothing beyond the agent plan you have. The design work counts against that plan the
        same way any other task does.
      </p>

      <h2>No agent?</h2>
      <p>
        You can still generate pages inside Wirely with your own key from Google AI Studio,
        OpenRouter, or Z.ai. The default model is on a free Gemini tier, and every model in the
        picker says whether it is free or paid. Keys are encrypted before they are stored.
      </p>

      <h2>Try it</h2>
      <p>
        Adding Wirely is one line in your agent. The <Link href="/docs">setup page</Link> has the
        command for each client.
      </p>
    </BlogPost>
  );
}
