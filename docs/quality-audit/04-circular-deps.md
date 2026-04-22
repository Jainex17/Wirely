# Circular Dependency Audit

Scope: `app/context/**`, `store/**`

## Method

I attempted `madge --circular` first. It failed in this environment because `bunx` could not write to its temp directory, so I fell back to a source scan of the scoped modules and their direct import edges.

## Findings

No circular dependencies were found in the scoped modules.

### In-scope graph

- `app/context/PreviewContext.tsx`
  - No imports
- `store/useEditorStore.ts`
  - Imports only outward dependencies:
    - `zustand`
    - `zustand/middleware`
    - `@/lib/sectionLayouts`
    - `@/lib/storage/safeLocalStorage`
    - `@/lib/canvasScene`

### Reverse references

There are consumers outside scope that import the store:

- `app/wire/[id]/WireEditor.tsx`
- `lib/exportProject.ts`
- `lib/wirePromptTarget.ts`

Those consumers do not import back into `app/context/PreviewContext.tsx` or `store/useEditorStore.ts`, so they do not form a cycle.

## Critical Assessment

The current scoped structure is already cycle-free and mostly aligned with a sane dependency direction:

- `PreviewContext` is isolated and has no dependencies beyond React.
- `useEditorStore` is a leaf-style state module that depends on utilities, not on UI modules.

The main risk is future regression, not a present defect. `store/useEditorStore.ts` is a shared state module that is imported by both app and library code, so it can easily become a hub if new features start importing app-level modules back into the store layer.

## Recommendations

1. Keep `store/useEditorStore.ts` dependency direction outward-only.
   - Do not import from `app/*` or any component/context module into the store.
   - Treat the store as infrastructure, not UI.

2. Prefer type-only or neutral shared modules for cross-cutting models.
   - If more consumers need `PageData`-like shapes, move shared types into a non-UI module before the store accumulates more importers.

3. Add a lightweight cycle check to CI or pre-merge verification.
   - Re-run `madge --circular` when the tempdir issue is fixed, or keep a small import-graph script around as a fallback.

## Result

No code changes were required for cycle removal in this scope because no cycles were present.
