# Comments Cleanup Audit

## Scope

Reviewed the allowed UI-facing surfaces:

- `README.md`
- `app/**`
- `components/**`

## Critical Assessment

The comment density in this scope was already low. Most of the remaining comments fell into two buckets:

- Inline JSX labels that restated obvious structure, such as skeleton section labels.
- Runtime notes that were actually useful, because they explain non-obvious browser or auth integration behavior.

The main cleanup opportunity was not a deep code smell. It was removing low-value narration and draft-like README text that added noise without improving maintainability.

## Recommendations

1. Remove comments that simply echo the surrounding code or JSX structure.
2. Keep comments only when they explain a non-obvious invariant, browser quirk, or third-party integration requirement.
3. Prefer concise, user-facing prose in `README.md`; draft bullets and typo-ridden notes read like unfinished work.

## Implemented Changes

- Removed the file header comment and section-label JSX comments from [`components/LoadingSkeleton.tsx`](/Users/jainex/projects/Wirely/components/LoadingSkeleton.tsx).
- Removed the Clerk CAPTCHA placeholder comment from [`app/login/LoginClient.tsx`](/Users/jainex/projects/Wirely/app/login/LoginClient.tsx).
- Removed the storage-failure narration comment from [`components/Canvas.tsx`](/Users/jainex/projects/Wirely/components/Canvas.tsx) and left the error log intact.
- Shortened the chart-resize comment in [`components/PageRenderer.tsx`](/Users/jainex/projects/Wirely/components/PageRenderer.tsx) so it still explains the invariant without overexplaining it.
- Rewrote the sloppy v1 README bullets in [`README.md`](/Users/jainex/projects/Wirely/README.md) to remove typos, dangling text, and draft-style phrasing.

## Residual Risk

One concise operational comment remains in scope in [`components/PageRenderer.tsx`](/Users/jainex/projects/Wirely/components/PageRenderer.tsx). It is justified because the resize-loop behavior is not obvious from the code alone.
