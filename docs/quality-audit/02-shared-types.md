# Shared Types Audit

Scope: consolidate shared type definitions in `lib/types.ts`, `store/**`, and the few direct consumers that rely on those shared models.

## Findings

1. `PageData` and `SectionData` were defined in the editor store and consumed from there by unrelated modules.
   - This made the store the de facto data-model layer even though the shapes are cross-cutting.
   - The duplicate definitions were small, but they were stable enough to justify a canonical shared module.

2. The persisted layout shape was partially duplicated.
   - `store/useEditorStore.ts` owned `PersistedWireLayout`.
   - `app/wire/[id]/WireEditor.tsx` rebuilt the same JSON-localStorage shape inline before hydrating the store.
   - That created a narrow but real drift risk for future layout fields.

3. The 2D position shape was repeated as ad hoc inline `{ x: number; y: number }` types.
   - That shape appears in store state, hydration, and editor persistence.
   - It is a good candidate for a single reusable coordinate type.

4. `SectionData.content` used a weak JSON-ish payload type.
   - The previous `Record<string, unknown>` gave little semantic value and pushed schema knowledge into callers.
   - A JSON object model is a stronger contract while still allowing flexible section content.

## Changes Made

- Added `lib/types.ts` as the canonical home for shared editor data types.
- Moved `PageRecord`, `SectionRecord`, `Point2D`, `PagePositionMap`, `PersistedWireLayout`, and related helper aliases into the shared module.
- Updated `store/useEditorStore.ts` to consume those shared definitions and re-export compatibility aliases for older import paths.
- Updated direct consumers to import from the shared module where that reduces ambiguity:
  - `lib/exportProject.ts`
  - `lib/wirePromptTarget.ts`
  - `app/wire/[id]/WireEditor.tsx`
- Replaced the weak `SectionData.content` payload with a JSON-object type instead of `unknown`.

## Assessment

High-confidence consolidation targets were handled:

- Page records are now defined once and reused across the store, export flow, and prompt-target helpers.
- Section records are now defined once and reused across the store and section editor UI.
- Persisted layout handling now shares a single DTO between localStorage hydration and store migration logic.
- Page position handling is now typed through a shared coordinate map instead of repeated inline object literals.

What I intentionally left local:

- Route-specific request bodies and UI prop interfaces that are not shared data models.
- Narrow one-off component props, where centralization would add indirection without reducing real duplication.

## Verification

- `bun test store/useEditorStore.test.ts lib/wirePromptTarget.test.ts` passed.
- `bun run lint` passed.
- `bun test` still reports an unrelated pre-existing failure in `components/canvas-upgrade.test.ts`.

## Recommendation

Keep using `lib/types.ts` as the shared home for editor data models. If later tasks uncover additional route or API payload types that are reused across files, move those into the same module only when they are genuinely cross-cutting. The next likely candidate is the wire-generation request/response DTO surface, but that should be handled separately from this store/data-model pass.

Note: `lib/exportProject.ts` was later removed in task 03 as dead code.
