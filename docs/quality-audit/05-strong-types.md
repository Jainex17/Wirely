# Strong Types Audit

## Scope

Reviewed the allowed API and library surfaces:

- `app/api/profile/details/route.ts`
- `app/api/profile/ai-settings/route.ts`
- `app/api/projects/route.ts`
- `app/api/projects/[projectId]/pages/route.ts`
- `app/api/projects/[projectId]/pages/[pageId]/route.ts`
- `app/api/projects/[projectId]/route.ts`
- `lib/auth/session.ts`
- `lib/db/queries/users.ts`
- `lib/wireGenerationPrompts.ts`

## Critical Assessment

The biggest avoidable weak-type usage in this scope was in route request DTOs. Several handlers already validated request payloads field-by-field, but they still typed the parsed JSON as `unknown` at the property level. That made the contract harder to read than it needed to be and forced repeated casts at the use site.

The next meaningful gap was in library code that already had stronger source-of-truth types available:

- Clerk session claims were being downcast to `Record<string, unknown>` even though the Clerk auth object already exposes typed session claims.
- The user AI settings query was treating `enabledGoogleModels` as `unknown`, even though the Drizzle schema defines it as a `string[]` JSON column.
- The repair prompt accepted a generic record even though it only ever receives a normalized `CritiqueReport`.

There are still intentional weak-type boundaries in the codebase. Raw JSON parsing, generic error sanitization, and model-output validation all need `unknown` at the edge. Those are legitimate boundary types, not cleanup targets.

## Recommendations

1. Type request bodies to the intended API contract first, then keep runtime validation for malformed input.
2. Prefer schema-inferred or domain-specific types when the source already guarantees shape, especially for database rows and auth/session objects.
3. Keep `unknown` only at true trust boundaries: parsed JSON, caught errors, and third-party payloads that are not yet normalized.
4. Do not replace boundary `unknown` with broad `any`-style convenience types. That hides bugs instead of reducing complexity.
5. If a value is already normalized before it reaches a helper, tighten the helper signature to the normalized type rather than re-accepting a loose record.

## Implemented

- Typed profile detail updates in [`app/api/profile/details/route.ts`](/Users/jainex/projects/Wirely/app/api/profile/details/route.ts).
- Typed AI settings updates in [`app/api/profile/ai-settings/route.ts`](/Users/jainex/projects/Wirely/app/api/profile/ai-settings/route.ts).
- Typed project creation/update payloads in:
  - [`app/api/projects/route.ts`](/Users/jainex/projects/Wirely/app/api/projects/route.ts)
  - [`app/api/projects/[projectId]/pages/route.ts`](/Users/jainex/projects/Wirely/app/api/projects/[projectId]/pages/route.ts)
  - [`app/api/projects/[projectId]/pages/[pageId]/route.ts`](/Users/jainex/projects/Wirely/app/api/projects/[projectId]/pages/[pageId]/route.ts)
  - [`app/api/projects/[projectId]/route.ts`](/Users/jainex/projects/Wirely/app/api/projects/[projectId]/route.ts)
- Replaced the Clerk session-claims cast with direct typed access in [`lib/auth/session.ts`](/Users/jainex/projects/Wirely/lib/auth/session.ts).
- Replaced the `enabledGoogleModels` query hole with the schema-inferred row type in [`lib/db/queries/users.ts`](/Users/jainex/projects/Wirely/lib/db/queries/users.ts).
- Tightened the repair prompt contract to accept `CritiqueReport` in [`lib/wireGenerationPrompts.ts`](/Users/jainex/projects/Wirely/lib/wireGenerationPrompts.ts).

## Verification

- `bun x eslint app/api/profile/details/route.ts app/api/profile/ai-settings/route.ts app/api/projects/route.ts 'app/api/projects/[projectId]/pages/route.ts' 'app/api/projects/[projectId]/pages/[pageId]/route.ts' 'app/api/projects/[projectId]/route.ts' lib/auth/session.ts lib/db/queries/users.ts lib/wireGenerationPrompts.ts`
- `bun x tsc --noEmit --pretty false` (passes after integration)

## Residual Risk

The broader repo still contains legitimate boundary-level `unknown` usage in JSON parsing and error handling helpers. That is expected and should remain until a separate task proves a stricter contract is safe.
