import { Awareness, Container, ContainerID, Cursor, Loro, LoroText, PeerID } from "loro-crdt";
import { EditorState, Plugin, PluginKey, Selection } from "prosemirror-state";
import { Decoration, DecorationAttrs, DecorationSet } from "prosemirror-view";
import { loroSyncPluginKey } from "./sync-plugin";
import { Node } from "prosemirror-model";
import { CHILDREN_KEY, LoroDoc, LoroNode, LoroNodeMapping, WEAK_NODE_TO_LORO_CONTAINER_MAPPING } from "./lib";
import { CursorAwareness } from "./awareness";

const loroCursorPluginKey = new PluginKey<{ awarenessUpdated: boolean }>(
  "loro-cursor",
);

const WEAK_MAP: WeakMap<Plugin<DecorationSet>, DecorationSet> = new WeakMap();

function createDecorations(
  state: EditorState,
  awareness: CursorAwareness,
  plugin: Plugin<DecorationSet>,
  createSelection: (user: PeerID) => DecorationAttrs
): DecorationSet {
  const all = awareness.getAll();
  const d: Decoration[] = [];
  const loroState = loroSyncPluginKey.getState(state);
  if (!loroState) {
    return DecorationSet.create(state.doc, []);
  }

  const doc = loroState.doc;

  for (const [peer, cursor] of Object.entries(all)) {
    if (!cursor.anchor || !cursor.focus) {
      continue;
    }

    const start = cursorToAbsolutePosition(state.doc, cursor.anchor, doc, loroState.mapping);
    const end = cursorToAbsolutePosition(state.doc, cursor.focus, doc, loroState.mapping);
    d.push(Decoration.inline(start, end, createSelection(peer as PeerID)));
  }

  const decorations = DecorationSet.create(state.doc, d);
  WEAK_MAP.set(plugin, decorations);
  return decorations;
}

export const loroCursorPlugin = (
  awareness: CursorAwareness,
  options: {
    getSelection?: (state: EditorState) => Selection
    createSelection?: (user: PeerID) => DecorationAttrs
  },
) => {
  const getSelection = options.getSelection || (state => state.selection)
  const createSelection = options.createSelection || (user => ({ class: "loro-selection", "data-peer": user, style: `background-color: ${user.slice(0, 6)}` }))
  const plugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({
    key: loroCursorPluginKey,
    state: {
      init(_, state) {
        return createDecorations(state, awareness, plugin, createSelection);
      },
      apply(tr, prevState, _oldState, newState) {
        const loroState = loroSyncPluginKey.getState(newState);
        const loroCursorState: { awarenessUpdated: boolean } = tr.getMeta(
          loroCursorPluginKey,
        );
        if (
          (loroState && loroState.changedBy !== "local") ||
          (loroCursorState && loroCursorState.awarenessUpdated)
        ) {
          return createDecorations(newState, awareness, plugin, createSelection);
        }

        return prevState;
      },
    },
    props: {
      decorations: (state) => {
        return WEAK_MAP.get(plugin);
      },
    },
    view: (view) => {
      const awarenessListener = () => {
        view.state.tr.setMeta(loroCursorPluginKey, { awarenessUpdated: true });
      };

      const updateCursorInfo = () => {
        const loroState = loroSyncPluginKey.getState(view.state);
        const current = awareness.getLocal();
        if (loroState?.doc == null) {
          return;
        }

        const pmRootNode = view.state.doc;
        if (view.hasFocus()) {
          const selection = getSelection(view.state);
          const anchor = absolutePositionToCursor(
            pmRootNode,
            selection.anchor,
            loroState.doc,
            loroState.mapping,
          );
          const focus = absolutePositionToCursor(
            pmRootNode,
            selection.head,
            loroState.doc,
            loroState.mapping,
          );
          if (
            current == null ||
            current.anchor?.containerId() != anchor?.containerId() ||
            current.anchor?.pos != anchor?.pos ||
            current.focus?.containerId() != focus?.containerId() ||
            current.focus?.pos != focus?.pos
          ) {
            awareness.setLocal({
              anchor,
              focus
            });
          }
        } else if (current?.focus != null) {
          awareness.setLocal({});
        }
      };

      // Listen to awareness changes
      awareness.addListener(awarenessListener);
      view.dom.addEventListener("focusin", updateCursorInfo);
      view.dom.addEventListener("focusout", updateCursorInfo);

      return {
        update: updateCursorInfo,
        destroy: () => {
          view.dom.removeEventListener("focusin", updateCursorInfo);
          view.dom.removeEventListener("focusout", updateCursorInfo);
          awareness.removeListener(awarenessListener);
          awareness.setLocal({});
        },
      };
    },
  });

  return plugin;
};


function absolutePositionToCursor(pmRootNode: Node, anchor: number, doc: LoroDoc, mapping: LoroNodeMapping): Cursor | undefined {
  const pos = pmRootNode.resolve(anchor);
  const nodeParent = pos.node(pos.depth - 1);
  const parentIndex = pos.index(pos.depth - 1);
  const offset = pos.parentOffset
  const loroId = WEAK_NODE_TO_LORO_CONTAINER_MAPPING.get(nodeParent)!;
  const loroMap: LoroNode = doc.getMap(loroId as any);
  const children = loroMap.get(CHILDREN_KEY);
  const text = children.get(parentIndex);
  if (text instanceof LoroText) {
    return text.getCursor(offset);
  } else {
    return undefined;
  }
}


function cursorToAbsolutePosition(pmRootNode: Node, cursor: Cursor, doc: LoroDoc, mapping: LoroNodeMapping): number {
  const textId = cursor.containerId()
  const loroText = doc.getText(textId);
  let pos = doc.getCursorPos(cursor);
  let index = pos.offset;
  let targetChildId = loroText.id;
  let loroNode = loroText.parent() as LoroNode | undefined;
  while (loroNode != null) {
    const children = loroNode.get(CHILDREN_KEY);
    const childIds = children.toJson() as ContainerID[];
    for (const iter of childIds) {
      if (iter === targetChildId) {
        break;
      }

      const mapped = mapping.get(iter)
      if (Array.isArray(mapped)) {
        mapped.forEach(child => {
          index += child.nodeSize;
        })

      } else {
        index += mapped!.nodeSize;
      }
    }

    targetChildId = loroNode.id;
    loroNode = loroNode.parent() as LoroNode | undefined;
  }

  return index;
}

