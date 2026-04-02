# AGENTS.md

## Project Overview
Wirely is a Next.js App Router app for generating and iterating multi-page web UI concepts with AI. Users create projects from the home screen, choose enabled BYOK models/providers, generate one or more outputs for a project, refine page HTML in a canvas-style editor, preview rendered pages safely, and persist project/page/conversation/generation history in Postgres.

Primary entry points:
- `app/page.tsx` + `app/HomeClient.tsx` (home/history, project creation, model/page-count selection)
- `app/wire/[id]/page.tsx` + `app/wire/[id]/WireEditor.tsx` (editor workspace)
- `app/profile/*` and `app/api/profile/ai-settings/route.ts` (BYOK provider/model settings)
- `app/api/wire/[id]/route.ts` (main AI generation/planning/repair stream)
- `app/api/projects/[projectId]/generate/route.ts` (authenticated proxy into the wire route)

## Stack
- Next.js 16 + React 19 + TypeScript (`strict`)
- Bun for scripts/tests
- Tailwind CSS v4 + Radix/shadcn-style UI components
- Zustand for editor state (`store/useEditorStore.ts`)
- Drizzle ORM + Neon Postgres (`lib/db/*`, `drizzle/*`)
- AI SDK providers: Google, OpenRouter, and Z.ai
- Unsplash BYOK for stock-image resolution inside generated HTML
- Neon auth/session integration (`lib/auth/*`, `middleware.ts`)
- JSZip + FileSaver for export flows

## Repository Map
- `app/` routes, pages, route handlers
- `components/` editor UI, canvas surface, renderers, settings/profile clients
- `lib/` core business logic (auth, db, security, prompt/output pipeline, planning/critique/orchestration, stock images, exports, rate-limits, logger)
- `store/` client state store(s)
- `hooks/` custom client hooks
- `drizzle/` SQL migrations + drizzle metadata snapshots
- `app/context/` client preview state
- `test/` Bun tests (plus colocated `*.test.ts`/`*.test.tsx` files)

High-signal files:
- `app/api/wire/[id]/route.ts`
- `app/api/projects/[projectId]/generate/route.ts`
- `app/api/profile/ai-settings/route.ts`
- `app/wire/[id]/WireEditor.tsx`
- `app/HomeClient.tsx`
- `components/WirePromptSidebar.tsx`
- `components/EditorWorkspace.tsx`
- `components/PageRenderer.tsx`
- `store/useEditorStore.ts`
- `lib/wireGenerationPrompts.ts`
- `lib/wireGenerationOrchestrator.ts`
- `lib/wireCritique.ts`
- `lib/wireFallbackPlan.ts`
- `lib/wireOutput.ts`
- `lib/wireQuality.ts`
- `lib/stockImages.ts`
- `lib/wireModels.ts`
- `lib/iframeSecurity.ts`
- `lib/security/userApiKeyCrypto.ts`
- `lib/db/schema.ts`
- `lib/db/queries/projects.ts`
- `lib/db/queries/generationRuns.ts`
- `lib/db/queries/users.ts`

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
- Server AI keys: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`
- Per-user key crypto: `USER_API_KEY_MASTER_SECRET_BASE64`, `USER_API_KEY_KEY_VERSION`, `USER_API_KEY_PREVIOUS_MASTER_SECRET_BASE64`
- Auth: `NEON_AUTH_BASE_URL`, `NEON_AUTH_LOGIN_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_AUTH_ISSUER`, `NEON_AUTH_AUDIENCE`, `NEON_AUTH_JWKS_URL`
- Request size guard: `REQUEST_BODY_MAX_BYTES`

Notes:
- Z.ai and Unsplash are user-supplied BYOK settings persisted in the database, not top-level `.env` entries in this repo snapshot.
- Missing generation metadata tables are handled defensively in `lib/db/queries/generationRuns.ts`, but the intended fix is still `bun run db:migrate`.

## Request/Data Flow
1. Home loads session + project list + AI settings.
2. Profile/settings routes let the user manage encrypted provider keys and enabled models.
3. Editor route loads project detail (pages + conversation history + latest generation metadata).
4. Client submits generation requests to `POST /api/projects/[projectId]/generate` or `POST /api/wire/[id]`.
5. `app/api/wire/[id]/route.ts` validates body, applies rate limits, checks ownership, resolves the provider/model, creates generation run/output records, plans outputs, generates HTML, critiques/repairs low-quality output, and injects stock image metadata.
6. Conversation messages and generated page HTML persist via `lib/db/queries/projects.ts` and `lib/db/queries/generationRuns.ts`.
7. Page HTML updates, creation, rename, and deletion persist through project/page API routes.
8. `components/PageRenderer.tsx` sanitizes HTML and applies iframe constraints/security helpers before previewing.
9. Export flows package rendered pages into a zip via `lib/exportProject.ts`.

## Coding Rules For Agents
- Keep TypeScript strict and preserve `@/*` imports.
- Follow existing style: functional React, explicit types at API boundaries, small helpers for validation.
- Reuse existing guard helpers (`readJsonBodyWithLimit`, session checks, logger) instead of duplicating logic.
- When touching API routes, preserve auth checks and status semantics expected by tests.
- Preserve route runtime contracts where present (`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60`).
- Prefer existing wire-generation helpers over embedding prompt/planning/repair logic directly in routes.
- Treat provider/API-key flows as encrypted BYOK paths; do not log raw keys, prompts, HTML, or message payloads.
- Prefer adding/updating Bun tests with behavior changes.

## High-Risk Areas (Extra Care Required)
- `app/api/wire/[id]/route.ts` (validation, provider behavior, streaming, planning/repair orchestration, rate limiting)
- `app/api/profile/ai-settings/route.ts` (input validation, encrypted key updates, enabled model normalization)
- `lib/wireGenerationPrompts.ts`, `lib/wireCritique.ts`, `lib/wireFallbackPlan.ts`, `lib/wireOutput.ts`, `lib/wireQuality.ts`, `lib/stockImages.ts`, `lib/iframeSecurity.ts` (prompt/output/security/quality pipeline coupling)
- `lib/security/userApiKeyCrypto.ts` (encryption/decryption/key version handling)
- `lib/db/queries/generationRuns.ts` (graceful fallback when generation metadata tables are missing)
- `lib/auth/*` and `middleware.ts` (session/auth flow)
- `lib/db/schema.ts` + `drizzle/*` (schema/migration integrity)
- `store/useEditorStore.ts` + `components/EditorWorkspace.tsx` (canvas state persistence, focus/layout behavior, optimistic page ops)

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
- If touching generation flows, verify planning/generation/repair/status updates still behave correctly for multi-output requests
- If touching provider settings, verify encrypted key save/clear semantics and enabled model validation
- Document any env var or API contract changes in `README.md`
