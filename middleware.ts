import { auth } from "@/lib/auth/server";
import { NextResponse } from "next/server";

const neonAuthMiddleware = auth.middleware({
  loginUrl: "/login",
});

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const hasOAuthVerifier = url.searchParams.has("neon_auth_session_verifier");

  const needsAuthMiddleware =
    pathname.startsWith("/wire") ||
    (pathname === "/" && hasOAuthVerifier);

  if (!needsAuthMiddleware) {
    return NextResponse.next();
  }

  return neonAuthMiddleware(request);
}

export const config = {
  matcher: ["/", "/wire/:path*"],
};
