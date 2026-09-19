# Wirely

Wirely is a web UI ideation workspace. You describe a screen, pick a model, and get one to three
generated HTML pages laid out on a pannable canvas. You keep prompting to refine them, and you can
wire pages together into a clickable prototype.

You can think of Wirely as an open source, bring-your-own-key alternative to the paid AI design
tools. It does not run your code. It generates self-contained HTML that renders in a sandboxed
iframe, which is why it costs nothing to host.

## What makes Wirely special?

These are the properties the product is built around. Do not trade them away for a feature.

### 1. It costs the maintainer nothing to run

Every generation call uses a key the user saved in settings. There is no shared pool, no server-side
billing, no credits. The default model is a free Gemini Flash tier, and the model catalog in
`lib/wireModels.ts` marks every entry `free` or `paid` so the user always knows what a run costs
them. Never add a code path that spends a server-owned key on user generation. The only server key
in the codebase is `GOOGLE_GENERATIVE_AI_API_KEY`, used as a fallback for generating a project
title, and that is the ceiling.

Free hosting also sets the real constraints. Both AI routes cap at `maxDuration = 60`. The database
is a small Neon Postgres. If a change needs a long-lived process, a queue, or a background worker,
it does not fit and needs a different design.

### 2. Generated HTML is hostile input

A model writes the HTML, and the user's prompt steers it. Treat every generated page as untrusted.
`lib/iframeSecurity.ts` is the only thing standing between that HTML and the user's session: it
strips disallowed tags, allowlists a handful of CDN script URLs and Unsplash image hosts, and injects
a restrictive Content Security Policy meta tag. Previews render through `srcdoc` with
`sandbox="allow-scripts"` and no `allow-same-origin`. Dropping that combination hands the page the
user's origin.

### 3. Speed of exploration is the product

The point is seeing several screens fast and picking one. A run generates up to three outputs with a
concurrency of 2, streams per-page status so the canvas fills in as work lands, and repairs a
low-quality output rather than failing the whole run. Anything that makes a run feel slower or
quieter than it is works against the reason people use this.

### 4. The user's keys are encrypted and never logged

Provider keys are stored with AES-256-GCM, bound to the user with additional authenticated data, and
versioned for rotation. See `lib/security/userApiKeyCrypto.ts`. The structured logger in
`lib/logger.ts` redacts sensitive fields. Never log a raw key, a full prompt, generated HTML, or a
message payload.

## A note from the maintainer

This is a solo, unfunded, open source project competing with tools that charge a lot. That means the
budget for complexity is small. Do not preserve complexity because it already exists, and do not add
machinery because it looks architecturally serious. Understand the real constraint first, then fight
for the smallest change that makes the behavior correct and obvious.

Measure twice, cut once, and apply YAGNI hard. Fight scope creep. Honor the intent of a request in a
minimal and realistic way.

The instructions below are good defaults, not hard rules. My stated preference overrides anything
here. If a rule fights the task in front of you, say so plainly and ask before breaking it.

## A small glossary

The code uses two names for the same thing in places. Be precise when you talk to me.

- **you** means the agent reading this file and changing Wirely.
- **I, me, maintainer** means the person building Wirely. That is who you are talking to.
- **user** means the person using Wirely to design screens.
- **project** is the durable unit of work, one row in `projects`. The editor route is `/wire/[id]`
  and the generation route is `/api/wire/[id]`, so "wire" and "project" mean the same entity. The
  database and the newer routes say project. Prefer project in new code.
- **page** is one generated screen inside a project, a row in `project_pages`. It carries its own
  HTML and a `device_type` of desktop or mobile.
- **run** is one generation request, a row in `generation_runs`, moving through
  planned, generating, repairing, and a terminal status.
- **output** is one planned screen within a run, a row in `generation_outputs`. A run produces one to
  three outputs and each maps to at most one target page.
- **plan** is the structured design brief the planner model returns, validated by
  `designPlanSchema` in `lib/wireGenerationTypes.ts`. It holds the global design direction plus a
  section blueprint and image slots per output.
- **generation mode** is one of `single_page`, `concept_variants`, or `information_architecture`.
  Concept variants are different designs of the same screen. Information architecture is different
  screens of the same site.
- **provider** is `google`, `openrouter`, or `zai`. Each has its own key in user settings and its own
  client construction in the wire route.
- **BYOK** means bring your own key. It is the only way generation is paid for.
- **canvas** is the pannable, zoomable surface in `components/Canvas.tsx` that holds page frames.
- **prototype flow** is a saved set of links between pages, stored in `project_prototype_flows` and
  played back at `/wire/[id]/prototype`.

## The three ways to hurt yourself

1. **Running migrations against the live database.** There is no local Postgres. `DATABASE_URL`
   points at the real Neon database with real projects in it. `bun run db:generate` writes migration
   SQL and is safe. `bun run db:migrate` applies it and is not. Read the generated SQL in `drizzle/`
   before applying anything, and never apply a migration I did not ask for.

2. **Spending my API credits in a loop.** Generation costs real money on paid models and burns a real
   daily quota on free ones. Do not call the wire route repeatedly to test a change. The pipeline is
   built from pure functions in `lib/` precisely so you can test planning, output parsing, quality
   scoring, and repair decisions without a provider call. If you genuinely need a live run, ask
   first, and use the cheapest free model.

3. **Weakening the preview sandbox to make something render.** When generated HTML does not display
   the way you expect, the fix is in the generation prompt or in the allowlist in
   `lib/iframeSecurity.ts`, with a deliberate entry and a test. The fix is never adding
   `allow-same-origin`, never `dangerouslySetInnerHTML` on page HTML, and never widening the CSP to
   get a script running.

## Things the layout will trick you on

- **The middleware file is `proxy.ts`.** Next 16 renamed it. There is no `middleware.ts`. It runs
  Clerk and protects `/wire/*` and `/setting/*`.
- **Auth is Clerk, not Neon Auth.** `app/api/auth/[...path]/route.ts` is a deprecated stub that
  returns 410. `lib/auth/session.ts` is the only session entry point, and it upserts the Clerk user
  into the `users` table on the way through.
- **`POST /api/projects/[projectId]/generate` fetches `/api/wire/[id]` over HTTP**, forwarding
  cookies to itself. That costs a round trip and a second 60 second budget. If you touch that path,
  collapsing it into a direct function call is welcome.
- **`lib/sanitize.ts` is not the preview path.** Nothing imports it except one test. Page HTML goes
  through `sanitizeIframeHtml` in `lib/iframeSecurity.ts`. Do not reach for `lib/sanitize.ts` and
  assume you are protected.
- **Several tests read source files as text** and assert that a helper name appears. See
  `test/api-route-guards.test.ts`. Rename a guard helper and those fail without any behavior
  changing. Update the assertion, do not delete the test.
- **The rate limiter is in-memory.** `lib/rate-limit/inMemoryStore.ts` resets on cold start and is
  per instance, so on serverless it limits much less than the 5 per minute and 30 per hour it
  advertises. Treat it as a speed bump, not a control.

## Hit every surface

The most common defect here is a change that works on the one path you tried. Before calling
something done, walk this list and say which entries applied.

- **Generation modes.** `single_page`, `concept_variants`, and `information_architecture` take
  different branches through planning and validation. A change to planning needs a decision for all
  three, even if the decision is that nothing changes.
- **Providers.** Google, OpenRouter, and Z.ai each build their client differently in the wire route,
  and Z.ai goes through the OpenAI-compatible client at a custom base URL. Provider-shaped changes
  need a decision per provider.
- **Output counts.** One output and three outputs behave differently. Multi-output runs share a plan,
  run at concurrency 2, and map to existing target pages. Test both.
- **Device types.** Pages are desktop or mobile, and the canvas frames and size presets differ.
- **Entry points.** Generation starts from the home prompt box and from the editor sidebar. Settings
  are reachable from the account menu and from the settings tabs. Fixing one entry point is not
  fixing the feature.
- **Server and client state.** Page HTML lives in Postgres and in the Zustand store, and the store
  persists canvas layout to local storage. A new page field usually needs the schema, the query, the
  API route, the store, and the hydration path.
- **Reverse states.** If you add a way in, add the way out and the way to see it. Create needs
  delete. Link needs unlink. A one way door is a bug.
- **Progress events.** Anything the pipeline emits must exist in `WireProgressEvent` in
  `lib/wireProgressEvents.ts`, pass `isWireProgressEvent`, and be handled in `hooks/useWireProgress.ts`.
  An event the validator rejects is silently dropped.
- **Migrations.** A schema change needs `bun run db:generate` and a reviewed SQL file in the same
  change.

## Running it

- `bun install` installs.
- `bun run dev` starts Next on port 3000.
- Copy `.env.example` to `.env.local`. You need `DATABASE_URL`, a Clerk publishable and secret key,
  and `USER_API_KEY_MASTER_SECRET_BASE64` from `openssl rand -base64 32`.
- Provider keys are not environment variables. Sign in, then save them at `/setting/provider` and
  enable models at `/setting/model`.
- Kill only a dev server you started yourself, by the process id you captured at spawn. Do not
  `pkill -f next` or match on a path. I run other things on this machine.

## Verifying

- Smallest proof that the change works. `bun test <file>` for the tests you touched, and
  `bun run lint` for the scope you changed.
- Behavior changes to the generation pipeline ship with a test against the pure function in `lib/`,
  not against a live model. The existing suites in `test/` show the pattern.
- Test observable behavior. Do not add tests that assert callback wiring or restate the
  implementation.
- Do not run a full build to check a small change unless I ask. It is slow and it is not the proof.
- Do not open a browser or use computer control to verify unless I explicitly ask for it.

## How generation works

The client posts to `/api/wire/[id]` through the AI SDK `useChat` hook, which reads a streaming data
response. The route validates and clamps the body, checks the rate limit, confirms the user owns the
project, resolves the provider and model from the user's encrypted settings, and opens a data stream.

Inside the stream it creates a run row, then calls the planner model once to produce a design brief
and a validated plan covering every output. It emits the plan, the planning summary, and a queued
status per page so the canvas can draw empty frames immediately. Then it generates outputs at
concurrency 2. Each output is parsed, normalized, and scored by `lib/wireQuality.ts`. A low score
triggers a critique and one repair pass. An output that still fails the gate is rejected rather than
saved, unless the critic itself fell back, in which case a renderable output above the fallback
acceptance score is let through and the event is logged. Accepted HTML gets its stock image slots resolved through
Unsplash when the user supplied a key, and a placeholder otherwise. Page HTML, conversation messages,
run status, and output metadata all persist as the stream runs, so a dropped connection does not lose
work.

## Where code lives

- `app/api/wire/[id]/route.ts` is the pipeline. It is about 1700 lines and it is the highest risk
  file in the repo. Prefer extracting logic into `lib/` over growing it.
- `app/` holds routes. Home is `page.tsx` plus `HomeClient.tsx` and `Landing.tsx`. The editor is
  `wire/[id]/`. Settings are `setting/`.
- `components/` holds the UI. `Canvas.tsx` is the surface, `PageRenderer.tsx` is the page frame and
  preview, `WirePromptSidebar.tsx` is the chat and generation controls and the largest client file.
- `lib/` holds the logic worth testing: prompts, planning types, output parsing, quality scoring,
  critique, fallback plans, stock images, iframe security, key encryption, rate limits, logging.
- `lib/db/` holds the Drizzle schema and queries. `drizzle/` holds generated migrations.
- `store/useEditorStore.ts` holds canvas camera, page positions, focus, and optimistic page edits.
- `test/` holds the cross-cutting suites. Narrower tests sit next to the file they cover.
- `docs/quality-audit/` holds past cleanup notes. It is a record, not a spec.

## Documentation

Most changes need no documentation change. The code is readable and you can read it.

- Update `README.md` when an environment variable, a setup step, or an API route changes. Those are
  the things a new contributor cannot discover by reading code.
- Keep an implementation explanation in a comment next to the code. Write a doc only when the
  reasoning crosses several files and the code cannot carry it.
- When a documented decision changes, rewrite the text. Do not append a second account of the new
  behavior next to the stale one.
- Do not enumerate fields, narrate control flow, maintain file catalogs, or add per-change summary
  files. Types and tests already record the implementation.

## Plans and scratch files

Do not commit implementation plans, research notes, or scratch files. Keep working material outside
the repository. A merged change is the record.

## Pull requests

- Never open a pull request unless I ask for one.
- Commit titles are plain sentences in the imperative, matching the existing log, for example
  "Stream live generation progress with per-page status tracking".
- One concern per change. If the description says "also", split it.
- UI changes need a before and after image. Motion needs a short video.

## Taste

- TypeScript stays strict and imports keep the `@/*` alias. Inferred types over annotations. `any` is
  the enemy.
- Route handlers stay thin. Validation, planning, parsing, and scoring belong in `lib/` as functions
  that take inputs and return values.
- Reuse the existing guards. `readJsonBodyWithLimit` for bodies, `getRequestSessionUser` for auth,
  the structured logger for output. Do not hand roll a second version.
- Preserve the route runtime contracts where they exist: `runtime = "nodejs"`,
  `dynamic = "force-dynamic"`, `maxDuration = 60`.
- Deletion beats addition. No interface with one implementation, no config for a value that never
  changes, no abstraction for a second case that does not exist.
- Comments explain why a function exists and how it is used. They do not narrate each line.
- Users are looking at design work, so a dropped frame, a lying spinner, or a stale label is visible.
  Avoid continuously repainting animations.

## Additional tips

- Security matters most at the two trust boundaries, which are user input into the API and generated
  HTML into the preview. Do not over-index elsewhere.
- When something is blocked or you are unsure, say so and finish everything that is not blocked.
- If you disagree with a request, say it plainly with your reasoning. Do not soften it into
  agreement.
