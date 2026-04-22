# DRY Audit

Scope reviewed:
- `components/AppHeader.tsx`
- `app/wire/[id]/WireEditor.tsx`
- `app/HomeClient.tsx`
- `hooks/`

## Critical assessment

The highest-confidence duplication in this scope was concentrated in authenticated account chrome. Before the cleanup, both `components/AppHeader.tsx` and `app/wire/[id]/WireEditor.tsx` each implemented the same account button, avatar/initials fallback, profile navigation, logout trigger, and logout confirmation dialog. That duplication increased maintenance cost without providing any meaningful local flexibility.

The rest of the scope was comparatively low-duplication. `app/HomeClient.tsx` does repeat model availability checks, but the logic is file-local and directly tied to the home page submission flow. Abstracting it further would add indirection without a clear reduction in complexity. `hooks/` did not contain an obvious shared primitive for the menu behavior, so no hook extraction was justified.

## Recommendations

1. Consolidate the authenticated account menu into a shared component when the same UI and dialog behavior appears in more than one shell.
2. Prefer small shared UI primitives over broad state abstractions when the duplicated unit is purely presentational.
3. Leave file-local validation logic in place unless it is reused elsewhere or has become materially harder to read than its abstraction.

## Implemented

- Added `components/UserAccountMenu.tsx` as the shared account-menu primitive.
- Updated `components/AppHeader.tsx` to consume the shared menu.
- Updated `app/wire/[id]/WireEditor.tsx` to consume the shared menu.
- Removed duplicated avatar, dropdown, profile navigation, and logout-dialog code from both callers.

## Deferred

- `app/HomeClient.tsx` still contains repeated model-key checks by design. The code is straightforward, and a shared helper would not meaningfully reduce complexity in this scope.
