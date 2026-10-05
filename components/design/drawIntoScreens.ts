/**
 * Puts a shape, frame, or text drawn inside a screen into that screen, the way
 * Figma parents what you draw to the frame under it. The design engine draws
 * every new node at the top of the page, so a rectangle drawn on a mobile
 * screen would float above it and not move with it.
 *
 * Nodes are collected while a drawing tool is active and adopted when the
 * draw finishes, which is when the engine switches back to the Select tool. A
 * screen added from the toolbar is created with Select active, so it stays a
 * screen.
 */
import type { Editor } from "@open-pencil/core/editor";

export const bindDrawIntoScreens = (editor: Editor) => {
  const drawn = new Set<string>();

  const stopCreated = editor.onEditorEvent("node:created", (node) => {
    if (editor.state.activeTool !== "SELECT" && editor.state.activeTool !== "HAND") drawn.add(node.id);
  });

  const stopTool = editor.onEditorEvent("tool:changed", (tool) => {
    if (tool !== "SELECT" || drawn.size === 0) return;
    const pageId = editor.state.currentPageId;
    const screens = editor.getChildren(pageId).filter((node) => node.type === "FRAME" && !drawn.has(node.id));
    for (const id of drawn) {
      const node = editor.getNode(id);
      if (!node || node.parentId !== pageId) continue;
      const centerX = node.x + node.width / 2;
      const centerY = node.y + node.height / 2;
      // The topmost screen under the center, since later siblings draw above.
      const screen = screens.findLast(
        (frame) =>
          centerX >= frame.x && centerX <= frame.x + frame.width && centerY >= frame.y && centerY <= frame.y + frame.height,
      );
      if (screen) editor.reparentNodes([id], screen.id);
    }
    drawn.clear();
  });

  return () => {
    stopCreated();
    stopTool();
  };
};
