<p align="center">
  <img src="app/icon.svg" alt="Wirely logo" width="88" height="88">
</p>

<h1 align="center">Wirely</h1>

<p align="center">
  The design canvas for your coding agent.
</p>

<p align="center">
  <a href="https://www.wirely.site">Website</a> ·
  <a href="https://www.wirely.site/docs">Connect your agent</a> ·
  <a href="LICENSE">MIT license</a>
</p>

---

You ask Claude Code, Cursor, Codex, or another agent to design a screen. The agent draws it on a
Wirely canvas while you watch. You compare ideas side by side, change what you want, and hand the
one you pick back to the agent to build in your codebase.

Wirely runs on the agent subscription you already pay for. It is free and open source, with no
plans and no credits.

## Get started

1. Sign in at [wirely.site](https://www.wirely.site).
2. Add the Wirely MCP server to your agent. For Claude Code:

   ```bash
   claude mcp add --transport http wirely https://www.wirely.site/api/mcp --scope user
   ```

3. On the first call your agent opens a browser tab. Click Authorize.
4. Ask it to design something, for example "Design three different layouts for a habit tracker
   in Wirely." The project shows up on your home page and fills in as the agent writes.

Commands for Cursor, Codex, opencode, other MCP clients, and clients that cannot open a browser
are on the [setup page](https://www.wirely.site/docs).

## What you can do

### Explore designs

- **Watch pages appear live.** Pages fill in on the canvas as your agent writes them.
- **Compare directions.** Ask for several options and see them next to each other.
- **Design for desktop and mobile.** Each page has its own device frame.
- **Organize the canvas.** Group pages, pan and zoom, and change the canvas background.

### Edit and hand back

- **Edit like a design tool.** Pick any element to change its text, colors, size, spacing, radius,
  and shadow. Drag to reorder, drag handles to resize, and double-click text to type into it.
  Moves snap to nearby edges and centers, and holding Alt shows distances.
- **Work with layers.** Each page in the pages panel opens into its layers for hiding, nesting,
  duplicating, and deleting. Frame, rectangle, and text tools add new elements. Cmd+Z undoes it
  all.
- **Send a pick to your agent.** Copy a link to one element or a whole page, and paste it into
  your agent with what to change. The agent edits only that element.
- **Hand your edits back.** Your agent can read a page's layers, rearrange them by id, and ask
  what you changed by hand since it last wrote the page.

### Build editable screens (preview)

Every project has a **Pages** tab for HTML pages and an **Editor** tab for screens made of frames,
text, shapes, and auto layout. Ask your agent for an editable design, or to make one of your pages
editable. In the Editor you can select, move, and resize anything, drag a layer between screens,
and copy and paste across them.

### Prototype, review, and export

- **Build a clickable prototype.** Link pages together, by hand or through your agent, then press
  Play to click through them or present them full screen.
- **Collect feedback.** Press C and click any element to comment, or send a review link so other
  people can pin comments. Your agent can read and resolve them.
- **Use your own images.** Upload images to the project's Assets folder, or ask your agent to
  upload one from your disk.
- **Draw vector art.** The pen tool draws on any page and edits shapes on vector pages.
- **Export.** Copy a page as an image, HTML, or SVG, or download it as a PNG at 2x or 3x or as a
  PDF.

### Generate without an agent

Add your own Google AI Studio, OpenRouter, or Z.ai key in settings and generate pages from the
chat in Wirely. The default model is on a free Gemini tier. Keys are encrypted at rest.

## Security

Pages render in a sandboxed iframe with a strict Content Security Policy, so a generated design
cannot reach your Wirely account. Wirely never runs your code.

## Run it yourself

You need [Bun](https://bun.sh), a Postgres database, and a [Clerk](https://clerk.com) app.

```bash
bun install
cp .env.example .env.local   # fill in the values
bun run db:migrate           # creates the tables in DATABASE_URL
bun run dev
```

Open http://localhost:3000. `.env.example` lists every setting. For
`USER_API_KEY_MASTER_SECRET_BASE64`, run `openssl rand -base64 32`. Point your agent at
`http://localhost:3000/api/mcp` to use your local copy.

## Contributing

Fork the repo, make your change on a branch, run `bun run lint` and `bun run test`, and open a
pull request.

## License

[MIT](LICENSE)
