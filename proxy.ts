import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/projects(.*)",
  "/wire(.*)",
  "/setting(.*)",
  // Review links are for signed-in users only.
  "/share(.*)",
  // The OAuth consent screen is for the signed-in account being connected.
  "/mcp(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // ".+" rather than ".*" leaves out "/" alone, so the static landing page
    // is served from the CDN without starting this function.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).+)",
    "/(api|trpc)(.*)",
  ],
};
