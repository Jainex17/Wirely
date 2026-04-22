# Legacy / Fallback Cleanup Audit

## Scope

Reviewed and cleaned:

- `lib/wireFallbackPlan.ts`
- `lib/wireOutput.ts`
- `lib/wireCritique.ts`
- `lib/wireGenerationPrompts.ts`

## Method

I traced the current generation flow, checked local callsites, and compared the live prompt contract against the parser and fallback helpers in scope. I then removed only branches that were either provably unused in-repo or clearly older compatibility paths that the current prompts no longer require.

## Findings

### `lib/wireFallbackPlan.ts`

The fallback-plan builder still carried a legacy compatibility path for `malformedSeed`. That branch tried to recover layout strategy, required elements, section labels, and even output mode from a previous seed shape. There are no current in-repo callers passing `malformedSeed`, and the live route already derives the fallback plan directly from the prompt, requested mode, and style preset.

That seed recovery path was doing extra work without a live consumer. Keeping it around made the fallback planner harder to read and suggested a second input contract that no longer exists in practice.

### `lib/wireOutput.ts`

The batch output parser still accepted two older shapes:

- legacy `VARIANT_n` / `VARIATION_n` markers
- raw HTML-document backfilling when indexed markers were missing

The current generation prompts only emit indexed `TITLE_n` and `HTML_n` sections. The older batch recovery branches were therefore compatibility glue for abandoned output formats, not current behavior.

### `lib/wireCritique.ts`

The critique normalizer still accepted legacy aliases that were no longer part of the current contract:

- `qualityViolations`
- `keepableScore`
- `repairNeeded`

The active prompt and downstream code now use `majorIssues`, `keepabilityScore`, and `shouldRepair`. Retaining the old aliases kept two naming schemes alive for the same concept.

### `lib/wireGenerationPrompts.ts`

`resolveRequestedMode` was a dead helper with no in-repo callers. Its logic duplicated the mode selection already handled by the fallback-plan builder, so it added surface area without adding behavior.

## Critical Assessment

The codebase still has intentional recovery behavior where it matters:

- `buildFallbackDesignBrief` remains the live fallback when the design-brief model fails.
- `buildFallbackCritiqueReport` remains the live fallback when critique normalization fails.
- `wireOutput.ts` still keeps single-output plain-text recovery, which is useful because the model can still omit markers in a first pass.

Those are current recovery paths, not legacy clutter. The cleanup focused on removing older compatibility layers that had drifted away from the current prompt contract or no longer had any callsite.

## Recommendations

1. Keep the prompt and parser contracts aligned.
   - If the prompt emits `TITLE_n` / `HTML_n`, the parser should not keep supporting abandoned batch marker formats unless a live caller still needs them.

2. Avoid preserving dead seed compatibility.
   - If no current entry point passes a malformed legacy seed, derive the fallback plan from the prompt and style preset directly.

3. Prefer one field name per concept in critique payloads.
   - Keep the current camelCase contract and only retain alias support when there is an active producer still emitting the older name.

4. Leave true recovery paths in place.
   - Fallback design briefs, fallback critique reports, and plain-text parsing still serve a current role and should not be removed just to make the code singular on paper.

## Implemented Changes

- Removed `malformedSeed` recovery from `lib/wireFallbackPlan.ts`.
- Simplified the fallback plan to derive layout strategy, required elements, and section labels directly from the current inputs.
- Removed legacy batch parser support for `VARIANT` / `VARIATION` markers and raw HTML-document backfilling in `lib/wireOutput.ts`.
- Removed obsolete critique aliases from `lib/wireCritique.ts`.
- Removed the dead `resolveRequestedMode` helper from `lib/wireGenerationPrompts.ts`.

## Verification

- `bun test lib/wireOutput.test.ts test/wire-critique.test.ts test/wire-fallback-plan.test.ts test/wire-generation-prompts.test.ts lib/stockImages.test.ts`
- `bun run lint`

## Residual Risk

The remaining fallback paths are intentional and still needed for runtime resilience:

- plain-text recovery in `wireOutput.ts`
- fallback design briefs in `wireGenerationPrompts.ts`
- fallback critique reports in `wireCritique.ts`

Those paths still make the system tolerant of model drift, but they are no longer carrying legacy compatibility branches that the current contract does not use.
