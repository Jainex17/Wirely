import Landing from "./Landing";

/**
 * The marketing page. It reads no session so Next builds it as a static file
 * and a first visit never waits on a cold function. A signed-in visitor gets
 * to their projects through any sign-in link, because /login redirects them.
 */
export default function Home() {
  return <Landing />;
}
