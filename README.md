# Wirely

## v1

- can seelct model and how many pages they want to generate on start
- select any pages that is generated and continue edit them
- figure out icons and images and charts
- planner-driven stock image slots with Unsplash BYOK and CDN-optimized image URLs
- generated HTML supports Bootstrap Icons class names (bi bi-...)
- export to figma
- 

## Production Guards

- Rate limit on `POST /api/wire/[id]`:
  - `5` requests/minute and `30` requests/hour per `userId + IP + route`.
  - Returns `429` with `Retry-After` and `X-RateLimit-*` headers when exceeded.
  - Current store is in-memory (free) with a pluggable interface ready for Redis later.
- Request payload size protection:
  - JSON APIs reject oversized payloads with `413`.
  - Maximum size is controlled by `REQUEST_BODY_MAX_BYTES` (default `65536`).
- Database pool safety:
  - Neon pool is process-cached with defaults:
    - `DB_POOL_MAX=5`
    - `DB_POOL_CONNECTION_TIMEOUT_MS=3000`
    - `DB_POOL_IDLE_TIMEOUT_MS=10000`
- Logging safety:
  - App logging uses structured sanitization that redacts sensitive fields (`authorization`, `cookie`, API keys, prompts, messages, HTML, response payloads).
  - Error stacks are only logged outside production.
- Client stability:
  - Editor persistence uses safe localStorage writes with quota retry and non-crashing fallback.
  - Global and editor-level React error boundaries prevent full workspace crashes.

## Auth Setup (Clerk)

- Required env vars:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`
- Google OAuth callback route is handled at `/sso-callback`.
