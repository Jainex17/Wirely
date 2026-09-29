import { describe, expect, it } from "bun:test";

import { s256CodeChallenge, verifierMatchesChallenge } from "./pkce";

describe("pkce", () => {
  // The worked example from RFC 7636 appendix B.
  it("derives the S256 challenge from the verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(s256CodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("accepts the matching verifier and rejects everything else", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = s256CodeChallenge(verifier);

    expect(verifierMatchesChallenge(verifier, challenge)).toBe(true);
    expect(verifierMatchesChallenge("short", challenge)).toBe(false);
    expect(verifierMatchesChallenge(`${verifier}x`, challenge)).toBe(false);
    // A verifier for a different challenge, and a challenge that is not even
    // the right shape, both fail closed.
    expect(verifierMatchesChallenge(verifier, s256CodeChallenge(`${verifier}y`))).toBe(false);
    expect(verifierMatchesChallenge(verifier, "not-a-challenge")).toBe(false);
  });
});
