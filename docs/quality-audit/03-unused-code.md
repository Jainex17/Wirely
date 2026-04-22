# Unused Code Audit

## Scope

Audited `app/**`, `components/**`, `hooks/**`, `lib/**`, `package.json` with evidence from:

- `knip` (`TMPDIR=.tmp BUN_INSTALL_CACHE_DIR=.bun-cache bunx knip`)
- `rg` reference checks before deletion

## Critical Assessment

The main cleanup opportunity was dead UI/editor scaffolding and one dead export module:

- Several component files had zero inbound imports and were not route entrypoints.
- `app/context/PreviewContext.tsx` was fully isolated and unused.
- `hooks/useDragAndDrop.ts` was dead along with the DnD packages.
- `lib/exportProject.ts` was unreferenced, and its only consumers (`jszip`, `file-saver`) were therefore dead dependencies.

`knip` also reported many "unused exports" from UI primitive files. Those are expected in shadcn-style component modules and are intentionally kept for composability, so they were not removed.

## High-Confidence Recommendations

1. Remove files with zero references and no framework convention requirements.
2. Remove dependency packages that are only used by removed dead files.
3. Keep potentially reusable exported UI primitives unless they are confirmed dead at the module level.

## Implemented

Removed dead files:

- `app/context/PreviewContext.tsx`
- `components/DraggableCard.tsx`
- `components/EmptyPageState.tsx`
- `components/LoadingSkeleton.tsx`
- `components/PageOptionsMenu.tsx`
- `components/PagePreviewModal.tsx`
- `components/SectionCustomizePopup.tsx`
- `components/SectionSkeleton.tsx`
- `components/Sidebar.tsx`
- `hooks/useDragAndDrop.ts`
- `lib/exportProject.ts`

Removed now-unused dependencies:

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`
- `file-saver`
- `jszip`
- `jose`
- `@types/file-saver`
- `tw-animate-css`
- `@types/dompurify`

Added missing direct dependency used in runtime code:

- `zod`

Lockfile sync:

- `bun install` (removed packages and rewrote `bun.lock`)
- `bun add zod`
- `bun remove @types/dompurify`

## Verification

- `bun run lint`
- `bun x tsc --noEmit --pretty false`
- `TMPDIR=.tmp BUN_INSTALL_CACHE_DIR=.bun-cache bunx knip` (post-cleanup output reduced to unlisted deps + unused exports)
- `bun run test` (still has one pre-existing failing test in `components/canvas-upgrade.test.ts`)

## Residual Risk

`knip` still flags some unlisted dependencies (`@next/env`, `postcss`) and many unused exports. I left those unchanged in this pass because they are either valid runtime/transitive usage patterns or require a separate dependency policy decision.
