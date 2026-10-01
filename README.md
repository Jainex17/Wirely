# Wirely

Wirely is a design canvas for your coding agent.

You ask Claude Code, Cursor, Codex, or another agent to design a screen. The agent draws it on a
Wirely canvas while you watch. You compare ideas side by side, tweak what you like, and hand the
winner back to the agent to build in your real codebase.

It uses the agent subscription you already pay for. Wirely is free and open source.

## What you can do

- **Watch designs appear live.** Pages fill in on the canvas as your agent writes them.
- **Compare directions.** Ask for several options and see them next to each other.
- **Edit like a design tool.** Pick any element to change its text, colors, size, spacing, and
  radius, and shadow. Drag it to reorder, drag its handles to resize, and double-click text to type
  into it. Moves and resizes snap to nearby edges and centers, and holding Alt shows the distance to
  the element under the pointer.
  Each page in the pages panel opens into its layers, for hiding, nesting, duplicating, and deleting,
  and Cmd+Z undoes it all. Frame, rectangle, and text tools add new elements.
- **Hand your edits back.** Your agent can read the page's layers, rearrange them by id, and ask
  what you changed by hand since it last wrote the page.
- **Send a pick to your agent.** Copy a link to one element, or to a whole page, and paste it into
  your agent with what to change.
- **Draw vector art.** The pen tool draws on any page, and on vector pages it also edits shapes.
- **Build a clickable prototype.** Link pages together and click through them like a real app.
- **Share for feedback.** Press C and click any element to comment on it, or send a review link
  so other people can pin comments. Your agent can read those comments too.
- **Design for desktop and mobile.** Each page has its own device frame.
- **Organize the canvas.** Group pages, pan and zoom, and change the canvas background.
- **Export.** Copy a page as an image, HTML, or SVG, or download it as a PNG at 2x or 3x or as a PDF.
- **Generate inside Wirely.** If you don't use an agent, add your own AI key in settings and
  generate pages from the chat. The default model is free.

Pages run in a locked-down preview, so a generated design can't touch your account.

## Connect your agent

1. Sign in and create a token on the home page.
2. Copy the install prompt and paste it into your agent.
3. Restart the agent and ask it to design something. The project shows up on home.

## Run it yourself

You need [Bun](https://bun.sh), a Postgres database, and a [Clerk](https://clerk.com) app.

```bash
bun install
cp .env.example .env.local   # fill in the values
bun run db:migrate           # sets up the tables in DATABASE_URL
bun run dev
```

Open http://localhost:3000. `.env.example` lists every setting. For
`USER_API_KEY_MASTER_SECRET_BASE64`, run `openssl rand -base64 32`.

## Contributing

Fork the repo, make your change on a branch, run `bun run lint` and `bun run test`, and open a
pull request.
