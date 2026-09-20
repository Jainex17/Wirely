# Wirely

Wirely is an AI web UI ideation and editing workspace built with Next.js App Router.  
Create a project, pick enabled models/providers, generate one or many page outputs, then iterate HTML in a canvas-style editor with safe previewing and persisted history.

## Features

- Multi-mode generation:
  - `single_page`
  - `concept_variants`
  - `information_architecture`
- Multi-output planning for coordinated page sets (up to 3 outputs per run).
- BYOK provider settings per user (Google, OpenRouter, Z.ai, Unsplash).
- Encrypted user API key storage (AES-256-GCM, user-bound AAD, key versioning).
- Quality gating and repair pass for generated HTML.
- Stock image slot planning plus Unsplash resolution and metadata injection.
- Canvas editor with persistent project/page/conversation history in Postgres.
- Safe iframe preview constraints for generated content.
- Route/runtime guardrails:
  - rate limits
  - request body size limits
  - structured logging with sensitive-field redaction

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript (`strict`)
- Bun scripts/test runner
- Tailwind CSS v4 + Radix/shadcn-style components
- Zustand editor state store
- Drizzle ORM + Neon Postgres
- AI SDK providers:
  - Google (`@ai-sdk/google`)
  - OpenRouter (`@openrouter/ai-sdk-provider`)
  - Z.ai (OpenAI-compatible client via `@ai-sdk/openai`)
- Clerk authentication (Google OAuth flow)

## Architecture (High Level)

1. Home (`/`) loads user session, project history, and enabled model settings.
2. Settings (`/setting/*`) manages profile, provider keys, and enabled models.
3. Editor (`/wire/[id]`) loads pages + conversation history.
4. Generation requests hit:
   - `POST /api/projects/[projectId]/generate` (authenticated proxy)
   - `POST /api/wire/[id]` (planning/generation/repair pipeline)
5. Outputs and messages persist to Postgres (`projects`, `project_pages`, `conversation_messages`, `generation_runs`, `generation_outputs`).
6. Preview renderer sanitizes output and applies iframe security constraints.

## Quick Start

### 1. Prerequisites

- Bun (latest stable recommended)
- Postgres database (Neon or compatible)
- Clerk app configured for Google OAuth

### 2. Install

```bash
bun install
```

### 3. Configure environment

Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

Generate an encryption secret for user API keys:

```bash
openssl rand -base64 32
```

Use the generated value for `USER_API_KEY_MASTER_SECRET_BASE64`.

### 4. Run migrations

```bash
bun run db:migrate
```

> Migration `0013_mighty_juggernaut` (or later) is required for the live
> generation progress, per-screen device frames, and prototype flow features:
> it adds `project_pages.device_type` and the `project_prototype_flows` table.

### 5. Start development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. First-run flow

1. Sign in via `/login`.
2. Add provider keys at `/setting/provider`.
3. Enable models at `/setting/model`.
4. Create a project from home and generate outputs.

## Environment Variables

From `.env.example`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string. |
| `USER_API_KEY_MASTER_SECRET_BASE64` | Yes | 32-byte base64 secret for encrypting BYOK provider keys. |
| `USER_API_KEY_KEY_VERSION` | Yes | Positive integer key version for new encryptions. |
| `USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64` | Optional | Previous 32-byte base64 secret for key rotation compatibility. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend key. |
| `CLERK_SECRET_KEY` | Yes | Clerk backend key. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Yes | Sign-in route, defaults to `/login`. |
| `REQUEST_BODY_MAX_BYTES` | Optional | Max JSON body size (default `65536`). |
| `DB_POOL_MAX` | Optional | DB pool size (default `5`). |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | Optional | DB connection timeout ms (default `3000`). |
| `DB_POOL_IDLE_TIMEOUT_MS` | Optional | DB idle timeout ms (default `10000`). |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional | Server key used for project title generation fallback. |
| `OPENROUTER_API_KEY` | Optional | Present in env example for compatibility; user-level key settings are used for generation. |

Notes:
- Generation requests require user-scoped provider keys saved in settings.
- Unsplash is configured in-app via BYOK (`/setting/provider`), not via top-level env var.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start local Next.js dev server. |
| `bun run build` | Production build. |
| `bun run start` | Start production server. |
| `bun run lint` | Run ESLint. |
| `bun run test` | Run Bun tests. |
| `bun run db:generate` | Generate Drizzle migration files. |
| `bun run db:migrate` | Apply Drizzle migrations. |
| `bun run db:backfill:page-html` | Currently points to a missing script path (see Known Limitations). |
| `bun run agent` | Start the Wirely local agent (runs opencode on your machine). |
| `bun run agent:doctor` | Check the local opencode install and print the detected flags. |

## API Surface (Core Routes)

- `GET /api/projects` - list current user projects.
- `POST /api/projects` - create a project (and initial page).
- `POST /api/projects/[projectId]/generate` - authenticated proxy into wire generation route.
- `POST /api/wire/[id]` - main planning/generation/repair pipeline.
- `GET /api/profile/ai-settings` - read provider-key/model settings flags.
- `PATCH /api/profile/ai-settings` - update encrypted provider keys and enabled models.
- `POST /api/projects/[projectId]/pages` - create page.
- `PATCH /api/projects/[projectId]/pages/[pageId]` - update page.
- `DELETE /api/projects/[projectId]/pages/[pageId]` - delete page.

Local agent routes (see "Local agent" below):

- `POST /api/projects/[projectId]/concepts` - queue a screen-concept run for the user's local agent.
- `GET /api/projects/[projectId]/concepts/[jobId]` - poll job status.
- `GET /api/profile/agent-tokens` - list agent tokens and whether an agent is connected.
- `POST /api/profile/agent-tokens` - mint an agent token (plaintext returned once).
- `DELETE /api/profile/agent-tokens` - revoke an agent token.
- `GET /api/agent/jobs/next` - long-poll claim endpoint, bearer auth only.
- `POST /api/agent/jobs/[jobId]/result` - agent reports back, bearer auth only.

## Local agent (bring your own subscription)

The local agent lets Wirely generate designs through the opencode already installed on the
user's machine, using whatever providers they configured with `opencode auth login`. A GitHub
Copilot, OpenRouter, or Z.AI coding plan therefore works without Wirely integrating any of them.

Credentials never reach the server. The agent dials out over ordinary HTTPS, so no relay, tunnel,
or inbound port is involved. Wirely stores the prompt going out and the model text coming back,
and nothing else.

Setup:

1. Install opencode (1.18.0 or newer) and sign in with `opencode auth login`.
2. Mint a token in Wirely settings.
3. `bun run agent -- login <token>`, then `bun run agent`.

Agent environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `WIRELY_URL` | `https://wirely.app` | Wirely base URL the agent polls. |
| `WIRELY_TOKEN` | unset | Token, overriding the one saved in `~/.config/wirely/agent.json`. |
| `OPENCODE_BIN` | `opencode` | Path to the opencode binary. |
| `WIRELY_MODEL` | unset | Default `provider/model` when a job does not name one. |

Version handling: the agent probes `opencode run --help` at startup and builds its argv from the
flags that build actually accepts, rather than from a hardcoded version table. This is what keeps
the 1.18.x line (which takes `--variant` and `--dir`) and the 2.0.x line (which uses
`provider/model#variant` and `--standalone`) both working. Both lines emit the same
`--format json` event stream, which is what the adapter parses.

## Security and Reliability Notes

- Rate limiting on `POST /api/wire/[id]`:
  - 5 requests per minute
  - 30 requests per hour
  - keyed by `userId + IP + route`
- JSON body guard rejects oversized payloads with `413`.
- Structured logger redacts sensitive fields and avoids stack traces in production.
- Security headers are applied globally in `next.config.ts`.
- Generated HTML is sanitized and constrained before iframe preview.

## Repository Structure

```text
app/                    # Next.js routes, pages, API handlers
components/             # Editor UI, canvas, renderers
lib/                    # Core logic (auth, db, generation pipeline, security)
store/                  # Zustand stores
hooks/                  # React hooks
drizzle/                # SQL migrations and metadata snapshots
test/                   # Bun tests
```

## Development and Testing

Run quality checks before opening a PR:

```bash
bun run lint
bun run test
```

If you change schema:

```bash
bun run db:generate
bun run db:migrate
```

## Known Limitations

- `db:backfill:page-html` currently references `scripts/backfill-page-html-from-conversation.ts`, but that file is not present in this repository snapshot.
- Rate limiting uses an in-memory store by default (not shared across instances).

## Contributing

1. Fork the repo.
2. Create a branch for your change.
3. Keep changes scoped and include tests when behavior changes.
4. Run lint/tests locally.
5. Open a pull request with context, rationale, and validation notes.

## License

No `LICENSE` file is currently present in this repository.  
Add one before distributing or accepting external contributions under a specific open source license.
