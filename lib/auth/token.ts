import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const AUTH_COOKIE_NAMES = [
  "neon-auth-token",
  "neon_auth_token",
  "__session",
  "id_token",
  "token",
] as const;

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

const parseCookieHeader = (cookieHeader: string | null) => {
  if (!cookieHeader) return new Map<string, string>();
  const map = new Map<string, string>();
  for (const chunk of cookieHeader.split(";")) {
    const [rawKey, ...rest] = chunk.trim().split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    const value = rest.join("=").trim();
    if (!value) continue;
    map.set(key, decodeURIComponent(value));
  }
  return map;
};

export const extractTokenFromCookieHeader = (cookieHeader: string | null) => {
  const cookieMap = parseCookieHeader(cookieHeader);
  for (const name of AUTH_COOKIE_NAMES) {
    const value = cookieMap.get(name);
    if (value) return value;
  }
  return null;
};

export const extractTokenFromAuthorizationHeader = (authorization: string | null) => {
  if (!authorization) return null;
  if (!authorization.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
};

export const extractTokenFromRequest = (request: Request) => {
  const authToken = extractTokenFromAuthorizationHeader(
    request.headers.get("authorization"),
  );
  if (authToken) return authToken;

  return extractTokenFromCookieHeader(request.headers.get("cookie"));
};

export const verifyNeonJwt = async (token: string): Promise<JWTPayload | null> => {
  const issuer = process.env.NEON_AUTH_ISSUER;
  const audience = process.env.NEON_AUTH_AUDIENCE;
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;

  if (!issuer || !audience || !jwksUrl) {
    return null;
  }

  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(jwksUrl));
  }

  try {
    const { payload } = await jwtVerify(token, jwksCache, {
      issuer,
      audience,
    });
    return payload;
  } catch {
    return null;
  }
};
