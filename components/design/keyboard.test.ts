import { describe, expect, it } from "bun:test";
import { findCommandForKey, matchesKeybinding } from "@/components/design/keyboard";

const key = (code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("matchesKeybinding", () => {
  it("reads $mod as Cmd on a Mac and Ctrl elsewhere", () => {
    expect(matchesKeybinding("$mod+KeyZ", key("KeyZ", { metaKey: true }), true)).toBe(true);
    expect(matchesKeybinding("$mod+KeyZ", key("KeyZ", { ctrlKey: true }), true)).toBe(false);
    expect(matchesKeybinding("$mod+KeyZ", key("KeyZ", { ctrlKey: true }), false)).toBe(true);
  });

  it("matches modifiers exactly, so Cmd+Shift+Z is not Cmd+Z", () => {
    expect(matchesKeybinding("$mod+KeyZ", key("KeyZ", { metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(matchesKeybinding("$mod+Shift+KeyZ", key("KeyZ", { metaKey: true, shiftKey: true }), true)).toBe(true);
  });

  it("matches a bare key and a Shift chord", () => {
    expect(matchesKeybinding("BracketRight", key("BracketRight"), true)).toBe(true);
    expect(matchesKeybinding("Shift+KeyA", key("KeyA", { shiftKey: true }), true)).toBe(true);
    expect(matchesKeybinding("Shift+KeyA", key("KeyA"), true)).toBe(false);
  });
});

describe("findCommandForKey", () => {
  const metadata = {
    "edit.undo": { keybinding: "$mod+KeyZ" },
    "edit.redo": { keybinding: ["$mod+Shift+KeyZ", "$mod+KeyY"] },
    "selection.goToMainComponent": {},
  };

  it("finds a command by any of its keybindings", () => {
    expect(findCommandForKey(metadata, key("KeyY", { metaKey: true }), true)).toBe("edit.redo");
    expect(findCommandForKey(metadata, key("KeyZ", { metaKey: true }), true)).toBe("edit.undo");
  });

  it("returns null when nothing is bound to the key", () => {
    expect(findCommandForKey(metadata, key("KeyQ", { metaKey: true }), true)).toBeNull();
  });
});
