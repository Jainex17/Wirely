# Error Handling Audit

## Scope

Audited `try/catch` usage in:

- `lib/db/queries/**`
- `lib/auth/**`
- `lib/security/**`

## Critical Assessment

### `lib/security/userApiKeyCrypto.ts`

This file had two defensive patterns that were too broad:

- `decodeBase64()` wrapped `Buffer.from(..., "base64")` in `try/catch`, but that call does not provide a meaningful failure boundary here. The actual validation is the decoded byte length, so the catch was unnecessary.
- `decryptUserApiKey()` swallowed every error while trying current/previous secrets and legacy AADs. That made decryption failures indistinguishable from unexpected crypto/runtime failures, which is error hiding rather than graceful handling.

The new behavior keeps the intended compatibility boundary for auth failures, but surfaces malformed payloads and unexpected exceptions immediately.

### `lib/db/queries/generationRuns.ts`

The `try/catch` blocks in this file are not generic defensive noise. They intentionally translate a missing generation-metadata schema into placeholder behavior so the app can keep running before migrations are applied.

That is still a fallback pattern, so it is not an ideal long-term design. However, removing it now would convert a known deployment-gap tolerance into hard failures in code paths that currently depend on the compatibility shim. I did not remove it in this pass.

### `lib/auth/session.ts`, `lib/db/queries/projects.ts`, `lib/db/queries/users.ts`

No unnecessary `try/catch` blocks were present in these files.

## Recommendations

1. Keep `userApiKeyCrypto` strict: only suppress expected authentication mismatches, never validation or unexpected runtime errors.
2. Treat the generation metadata fallback as temporary infrastructure compatibility. If you want singular behavior, gate it behind migration readiness instead of query-level catches.
3. When a `try/catch` exists, make the boundary explicit in code or comments. If it is only there to “try everything and see what works,” it is probably too broad.

## Implemented Changes

- Removed the no-op base64 `try/catch` in `lib/security/userApiKeyCrypto.ts`.
- Narrowed decryption retry logic to continue only on expected ciphertext authentication failures.
- Preserved explicit `UserApiKeyCryptoError` behavior for malformed input and configuration issues.

## Residual Risk

The generation-run compatibility fallback still hides missing-table errors by design. That is acceptable for this pass, but it remains the main place where schema drift is being converted into a soft failure.
