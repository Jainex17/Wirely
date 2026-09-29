/**
 * PKCE (RFC 7636) for the connect flow. Every client is public — no secret —
 * so the code verifier is the only thing standing between an intercepted
 * authorization code and a Wirely token. S256 is the only method offered;
 * `plain` is refused at the authorize step.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export const isCodeVerifier = (value: string): boolean => CODE_VERIFIER_PATTERN.test(value);

export const isCodeChallenge = (value: string): boolean => CODE_CHALLENGE_PATTERN.test(value);

/** RFC 7636 appendix B: BASE64URL-ENCODE(SHA256(ASCII(code_verifier))). */
export const s256CodeChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier, "ascii").digest("base64url");

/**
 * Timing-safe comparison of a presented verifier against a stored challenge.
 * Length is checked before timingSafeEqual because it throws on a mismatch.
 */
export const verifierMatchesChallenge = (verifier: string, challenge: string): boolean => {
  if (!isCodeVerifier(verifier) || !isCodeChallenge(challenge)) return false;
  const computed = s256CodeChallenge(verifier);
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
};
