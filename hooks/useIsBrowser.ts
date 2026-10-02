import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during the server render and hydration, true after. A preview frame's
 * HTML waits for it, because its policy names the browser's origin so project
 * images load, and a server render would hydrate without it.
 */
export const useIsBrowser = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
