/**
 * Node ids that survive a save. The design engine numbers nodes afresh every
 * time it loads a document, so the id a tool returned is gone by the next
 * call, which loads the document again. What the .fig file does keep is each
 * node's GUID, held in `source.id`. So every node gets a GUID before it is
 * saved, and every id that leaves the engine, to an agent or to the editor's
 * selection, is the GUID. Ids coming back in are turned into the engine's
 * current ones.
 *
 * Only values under id-like keys are translated, never free text, so a text
 * layer reading "1:3" stays as it is. Variable, collection, and mode ids keep
 * their own ids across loads and are left alone.
 */
import type { SceneGraph } from "@open-pencil/scene-graph";

// The session number the engine's writer uses for GUIDs it makes up. Ours
// count up past every GUID already in the document, so none collide.
const NEW_GUID_SESSION = 1;

const localIdOf = (guid: string) => Number(guid.split(":")[1]) || 0;

/** Gives every node without a GUID a fresh one. Run before every write. */
export const assignNodeGuids = (graph: SceneGraph) => {
  let highest = 0;
  for (const node of graph.nodes.values()) {
    if (node.source.id) highest = Math.max(highest, localIdOf(node.source.id));
  }
  for (const node of graph.nodes.values()) {
    if (!node.source.id && node.id !== graph.rootId) {
      highest += 1;
      node.source.id = `${NEW_GUID_SESSION}:${highest}`;
    }
  }
};

// "deleted" is the id a delete removed, which only the translator built before the delete still knows.
const ID_KEY = /(?:^|_)ids?$|Ids?$|^(?:children|parent|deleted)$/;
const NOT_A_NODE_KEY = /variable|collection|mode/i;

const isIdKey = (key: string) => ID_KEY.test(key) && !NOT_A_NODE_KEY.test(key);

type Translate = (id: string) => string;

const translateValue = (value: unknown, translate: Translate, underIdKey: boolean): unknown => {
  if (typeof value === "string") return underIdKey ? translate(value) : value;
  if (Array.isArray(value)) return value.map((entry) => translateValue(entry, translate, underIdKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, translateValue(entry, translate, isIdKey(key))]),
    );
  }
  return value;
};

/**
 * Translates ids between the engine's current numbering and GUIDs for one
 * loaded scene. Build it after `assignNodeGuids`, so new nodes have GUIDs.
 */
export const createIdTranslator = (graph: SceneGraph) => {
  const toPublic = new Map<string, string>();
  const toLocal = new Map<string, string>();
  for (const node of graph.nodes.values()) {
    if (!node.source.id) continue;
    toPublic.set(node.id, node.source.id);
    toLocal.set(node.source.id, node.id);
  }
  const publicId: Translate = (id) => toPublic.get(id) ?? id;
  const localId: Translate = (id) => toLocal.get(id) ?? id;

  return {
    publicId,
    localId,
    /**
     * Tool arguments with GUIDs turned into current ids. batch_update takes
     * its operations as a JSON string, which is translated inside.
     */
    argsToLocal: (args: Record<string, unknown>) => {
      const translated = translateValue(args, localId, false) as Record<string, unknown>;
      if (typeof translated.operations === "string") {
        try {
          translated.operations = JSON.stringify(translateValue(JSON.parse(translated.operations), localId, false));
        } catch {
          // Not JSON. The tool reports that itself.
        }
      }
      return translated;
    },
    /** A tool result with current ids turned into GUIDs. */
    resultToPublic: (result: unknown) => translateValue(result, publicId, false),
  };
};
