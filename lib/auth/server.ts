import { createNeonAuth } from "@neondatabase/neon-js/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL || process.env.NEON_AUTH_LOGIN_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!baseUrl) {
  throw new Error("Missing NEON_AUTH_BASE_URL.");
}

if (!cookieSecret) {
  throw new Error("Missing NEON_AUTH_COOKIE_SECRET.");
}

if (cookieSecret.length < 32) {
  throw new Error(
    "NEON_AUTH_COOKIE_SECRET must be at least 32 characters long."
  );
}

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
  },
});
