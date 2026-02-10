import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

const neonAuthMiddleware = auth.middleware({
  loginUrl: "/login",
});

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasOAuthVerifier = request.nextUrl.searchParams.has(
    "neon_auth_session_verifier",
  );

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
