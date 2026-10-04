"use client";

import type { Editor } from "@open-pencil/core/editor";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { watch } from "vue";

/**
 * A value read from the design editor, kept current in React. The editor's
 * state is Vue reactive (the canvas needs that), so a Vue watcher reruns
 * `read` whenever state it touches changes, and on every scene edit through
 * `sceneVersion`, since scene nodes themselves are not reactive. `read` runs
 * often, so keep it a cheap lookup. `isEqual` stops a rerender when a new
 * object holds the same values. `deps` are the props `read` uses, like a node
 * id: when one changes the value is read again rather than kept from before.
 */
export const useEditorValue = <T>(
  editor: Editor,
  read: (editor: Editor) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
  deps: readonly unknown[] = [],
): T => {
  const readRef = useRef(read);
  readRef.current = read;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const valueRef = useRef<{ value: T } | null>(null);
  const depsRef = useRef(deps);
  if (deps.length !== depsRef.current.length || deps.some((dep, index) => !Object.is(dep, depsRef.current[index]))) {
    depsRef.current = deps;
    valueRef.current = null;
  }

  const subscribe = useCallback(
    (notify: () => void) =>
      watch(
        () => {
          void editor.state.sceneVersion;
          return readRef.current(editor);
        },
        (next) => {
          if (valueRef.current && isEqualRef.current(valueRef.current.value, next)) return;
          valueRef.current = { value: next };
          notify();
        },
        { flush: "sync" },
      ),
    [editor],
  );

  const getSnapshot = () => {
    valueRef.current ??= { value: readRef.current(editor) };
    return valueRef.current.value;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** Shallow equality for arrays and plain objects, for `useEditorValue`. */
export const shallowEqual = <T>(a: T, b: T) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
};
