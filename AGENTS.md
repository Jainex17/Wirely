# AGENTS.md

## Project Overview
Wirely is a Next.js App Router app for generating and iterating multi-page web UI concepts with AI. Users create projects, generate or refine page HTML, preview pages in an editor, and persist project/page/conversation history in Postgres.

Primary entry points:
- `app/page.tsx` (home/history)
- `app/wire/[id]/page.tsx` (editor workspace)
- `app/api/wire/[id]/route.ts` (AI generation stream)

## Stack
- Next.js 16 + React 19 + TypeScript (`strict`)
- Bun for scripts/tests
- Tailwind CSS v4 + Radix/shadcn-style UI components
- Zustand for editor state (`store/useEditorStore.ts`)
- Drizzle ORM + Neon Postgres (`lib/db/*`, `drizzle/*`)
- AI SDK providers: Google + OpenRouter
- Neon auth/session integration (`lib/auth/*`, `middleware.ts`)

## Repository Map
- `app/` routes, pages, route handlers
- `components/` editor UI and rendering surface
- `lib/` core business logic (auth, db, security, prompt/output pipeline, rate-limits, logger)
- `store/` client state store(s)
- `hooks/` custom client hooks
- `drizzle/` SQL migrations + drizzle metadata snapshots
- `test/` Bun tests (plus colocated `*.test.ts`/`*.test.tsx` files)

High-signal files:
- `app/api/wire/[id]/route.ts`
- `app/api/projects/[projectId]/generate/route.ts`
- `components/WirePromptSidebar.tsx`
- `components/PageRenderer.tsx`
- `lib/wirePrompt.ts`
- `lib/wireOutput.ts`
- `lib/wireQuality.ts`
- `lib/iframeSecurity.ts`
- `lib/security/userApiKeyCrypto.ts`
- `lib/db/schema.ts`
- `lib/db/queries/projects.ts`

## Local Commands
- Install deps: `bun install`
- Dev server: `bun run dev`
- Build: `bun run build`
- Start prod server: `bun run start`
- Test: `bun run test`
- Lint: `bun run lint`
- Generate migrations: `bun run db:generate`
- Run migrations: `bun run db:migrate`

Note: `package.json` includes `db:backfill:page-html`, but currently points to `scripts/backfill-page-html-from-conversation.ts`; this path is not present in this repo snapshot.

## Environment Contract
See `.env.example`. Key variables:
- DB: `DATABASE_URL`, `DB_POOL_MAX`, `DB_POOL_CONNECTION_TIMEOUT_MS`, `DB_POOL_IDLE_TIMEOUT_MS`
- AI keys: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`
- Per-user key crypto: `USER_API_KEY_MASTER_SECRET_BASE64`, `USER_API_KEY_KEY_VERSION`, `USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64`
- Auth: `NEON_AUTH_BASE_URL`, `NEON_AUTH_LOGIN_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_AUTH_ISSUER`, `NEON_AUTH_AUDIENCE`, `NEON_AUTH_JWKS_URL`
- Request size guard: `REQUEST_BODY_MAX_BYTES`

## Request/Data Flow
1. Home loads session + project list + AI settings.
2. Editor route loads project detail (pages + conversation history).
3. Client submits generation requests to `POST /api/wire/[id]` (or project proxy route).
4. `app/api/wire/[id]/route.ts` validates body, applies rate limits, checks ownership, resolves model/provider, and streams AI output.
5. Conversation messages are persisted via `lib/db/queries/projects.ts`.
6. Page HTML updates persist through project page API routes.
7. Renderer sanitizes HTML and applies iframe constraints/security helpers.

## Coding Rules For Agents
- Keep TypeScript strict and preserve `@/*` imports.
- Follow existing style: functional React, explicit types at API boundaries, small helpers for validation.
- Reuse existing guard helpers (`readJsonBodyWithLimit`, session checks, logger) instead of duplicating logic.
- When touching API routes, preserve auth checks and status semantics expected by tests.
- Prefer adding/updating Bun tests with behavior changes.

## High-Risk Areas (Extra Care Required)
- `app/api/wire/[id]/route.ts` (validation, provider behavior, streaming, rate limiting)
- `lib/wireOutput.ts`, `lib/wireQuality.ts`, `lib/iframeSecurity.ts` (sanitization/quality/security pipeline coupling)
- `lib/security/userApiKeyCrypto.ts` (encryption/decryption/key version handling)
- `lib/auth/*` and `middleware.ts` (session/auth flow)
- `lib/db/schema.ts` + `drizzle/*` (schema/migration integrity)

For these areas: make minimal changes, add/adjust tests in the same PR, and avoid broad refactors.

## Files Usually Not Edited Manually
- `drizzle/meta/*` snapshots (generated)
- `.next/*` build output
- `node_modules/*`
- `.env.local` (local secret material)

## Practical Checklist Before Finishing
- Run `bun run lint`
- Run `bun run test` (or targeted tests for touched modules)
- If schema changed: run `bun run db:generate` and review migration SQL
- Verify routes still return expected 4xx/5xx behavior for invalid/unauthenticated requests
- Document any env var or API contract changes in `README.md`
