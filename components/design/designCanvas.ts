/**
 * The design canvas: the engine's Skia renderer and its pointer, text, and
 * drop input, mounted as a small Vue app inside the React editor. The design
 * engine ships those as Vue composables, and they are the hardest part of a
 * Figma-like canvas to get right (selection, drag, resize, rotate, snapping,
 * auto layout reordering, the pen, inline text editing), so the canvas reuses
 * them as they are and everything around it is React.
 *
 * The mounted app hands back the engine's editor commands (undo, group, frame
 * selection, auto layout, layer order, zoom, and the rest), which the React
 * toolbar, menus, and keyboard shortcuts run.
 */
/* eslint-disable react-hooks/rules-of-hooks -- the use* calls here are Vue composables in a Vue setup function, not React hooks. */
import type { Editor } from "@open-pencil/core/editor";
import {
  EDITOR_KEY,
  toolCursor,
  useCanvas,
  useCanvasDrop,
  useCanvasInput,
  useEditorCommands,
  useTextEdit,
} from "@open-pencil/vue";
import { computed, createApp, defineComponent, h, ref } from "vue";

export type DesignCommands = ReturnType<typeof useEditorCommands>;

const DesignCanvas = defineComponent({
  props: {
    editor: { type: Object as () => Editor, required: true },
    onReady: { type: Function as unknown as () => (commands: DesignCommands) => void, required: true },
  },
  setup(props) {
    const { editor } = props;
    const canvasRef = ref<HTMLCanvasElement | null>(null);
    const { hitTestSectionTitle, hitTestComponentLabel, hitTestFrameTitle } = useCanvas(canvasRef, editor, {
      showRulers: false,
    });
    const { cursorOverride } = useCanvasInput(
      canvasRef,
      editor,
      hitTestSectionTitle,
      hitTestComponentLabel,
      hitTestFrameTitle,
    );
    useTextEdit(canvasRef, editor);
    const { isDraggingOver } = useCanvasDrop(canvasRef, editor);
    props.onReady(useEditorCommands());

    const cursor = computed(() => toolCursor(editor.state.activeTool, cursorOverride.value));
    return () =>
      h("div", { style: "position: absolute; inset: 0; overflow: hidden" }, [
        h("canvas", {
          ref: canvasRef,
          tabindex: -1,
          "data-design-canvas": "",
          style: {
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
            display: "block",
            outline: "none",
            touchAction: "none",
            cursor: cursor.value,
          },
        }),
        isDraggingOver.value
          ? h("div", {
              style:
                "position: absolute; inset: 0; pointer-events: none; border: 2px dashed rgb(14 165 233 / 0.6); background: rgb(14 165 233 / 0.05)",
            })
          : null,
      ]);
  },
});

/** Mounts the canvas for `editor` into `container`. Returns the unmount function. */
export const mountDesignCanvas = (
  container: HTMLElement,
  editor: Editor,
  onReady: (commands: DesignCommands) => void,
) => {
  const app = createApp(DesignCanvas, { editor, onReady });
  // Provided by the app rather than the component, so the canvas component's
  // own composables can inject it.
  app.provide(EDITOR_KEY, editor);
  app.mount(container);
  return () => app.unmount();
};
