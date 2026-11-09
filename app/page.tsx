import Landing from "./Landing";

// Clerk keeps __client_uat readable by the page: the last sign-in time while
// signed in, 0 once signed out, with a _suffix on some instances. Checking it
// before the landing paints sends a signed-in visitor on to their projects
// without a server session read, so the page stays a static file. A stale
// cookie only costs a hop: /projects bounces to /login, which signs them in.
const SIGNED_IN_REDIRECT = `if(/(?:^|;\\s*)__client_uat(?:_[^=]*)?=[1-9]/.test(document.cookie))location.replace("/projects")`;

/**
 * The marketing page. It reads no session so Next builds it as a static file
 * and a first visit never waits on a cold function.
 */
export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_REDIRECT }} />
      <Landing />
    </>
  );
}
