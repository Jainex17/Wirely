/**
 * Matches keyboard events against the design engine's keybindings, written
 * like "$mod+Shift+KeyZ": modifiers, then a KeyboardEvent.code. `$mod` is Cmd
 * on a Mac and Ctrl elsewhere, the way Figma reads its shortcuts. Matching is
 * exact, so Cmd+Shift+Z never also runs Cmd+Z.
 */

export interface KeyLike {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export const matchesKeybinding = (binding: string, event: KeyLike, isMac: boolean) => {
  const parts = binding.split("+");
  const code = parts.pop();
  const wanted = new Set(parts.map((part) => (part === "$mod" ? (isMac ? "Meta" : "Control") : part)));
  return (
    code === event.code &&
    wanted.has("Meta") === event.metaKey &&
    wanted.has("Control") === event.ctrlKey &&
    wanted.has("Alt") === event.altKey &&
    wanted.has("Shift") === event.shiftKey
  );
};

/** The first command whose keybinding, or any of its keybindings, matches. */
export const findCommandForKey = <Id extends string>(
  metadata: Record<Id, { keybinding?: string | string[]; shortcut?: string; contextTestId?: string }>,
  event: KeyLike,
  isMac: boolean,
): Id | null => {
  for (const id of Object.keys(metadata) as Id[]) {
    const { keybinding } = metadata[id];
    const bindings = keybinding === undefined ? [] : Array.isArray(keybinding) ? keybinding : [keybinding];
    if (bindings.some((binding) => matchesKeybinding(binding, event, isMac))) return id;
  }
  return null;
};

/** Whether keys typed here belong to a field rather than the canvas. */
export const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
