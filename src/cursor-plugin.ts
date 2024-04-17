import { Awareness, Container, ContainerID, Cursor, Loro, LoroList, LoroText, PeerID } from "loro-crdt";
import { EditorState, Plugin, PluginKey, Selection } from "prosemirror-state";
import { Decoration, DecorationAttrs, DecorationSet } from "prosemirror-view";
import { loroSyncPluginKey } from "./sync-plugin";
import { Node } from "prosemirror-model";
import { CHILDREN_KEY, LoroDocType, LoroNode, LoroNodeMapping, WEAK_NODE_TO_LORO_CONTAINER_MAPPING } from "./lib";
import { CursorAwareness } from "./awareness";

const loroCursorPluginKey = new PluginKey<{ awarenessUpdated: boolean }>(
  "loro-cursor",
);

const WEAK_MAP: WeakMap<Plugin<DecorationSet>, DecorationSet> = new WeakMap();

function createDecorations(
  state: EditorState,
  awareness: CursorAwareness,
  plugin: Plugin<DecorationSet>,
  createSelection: (user: PeerID) => DecorationAttrs,
  createCursor: (user: PeerID) => Element
): DecorationSet {
  const all = awareness.getAll();
  const d: Decoration[] = [];
  const loroState = loroSyncPluginKey.getState(state);
  if (!loroState) {
    return DecorationSet.create(state.doc, []);
  }

  const doc = loroState.doc;
  const thisPeer = doc.peerIdStr;

  for (const [peer, cursor] of Object.entries(all)) {
    if (peer === thisPeer) {
      continue;
    }

    if (!cursor.anchor || !cursor.focus) {
      continue;
    }

    const anchor = cursorToAbsolutePosition(state.doc, cursor.anchor, doc as LoroDocType, loroState.mapping);
    const focus = cursorToAbsolutePosition(state.doc, cursor.focus, doc as LoroDocType, loroState.mapping);
    d.push(Decoration.widget(focus, createCursor(peer as PeerID)));
    d.push(Decoration.inline(Math.min(anchor, focus), Math.max(anchor, focus), createSelection(peer as PeerID)));
  }

  const decorations = DecorationSet.create(state.doc, d);
  WEAK_MAP.set(plugin, decorations);
  return decorations;
}

export const LoroCursorPlugin = (
  awareness: CursorAwareness,
  options: {
    getSelection?: (state: EditorState) => Selection
    createCursor?: (user: PeerID) => Element
    createSelection?: (user: PeerID) => DecorationAttrs
  },
) => {
  const getSelection = options.getSelection || (state => state.selection)
  const createSelection = options.createSelection || (user => ({ class: "loro-selection", "data-peer": user, style: `background-color: rgba(228, 208, 102, 0.5)` }))
  const createCursor = options.createCursor || (user => {
    const cursor = document.createElement('span')
    cursor.classList.add('ProseMirror-loro-cursor')
    cursor.setAttribute('style', `border-color: ${user.slice(0, 6)}`)
    const userDiv = document.createElement('div')
    userDiv.setAttribute('style', `background-color: ${user.slice(0, 6)}`)
    userDiv.insertBefore(document.createTextNode(user.slice(0, 6)), null)
    const nonbreakingSpace1 = document.createTextNode('\u2060')
    const nonbreakingSpace2 = document.createTextNode('\u2060')
    cursor.insertBefore(nonbreakingSpace1, null)
    cursor.insertBefore(userDiv, null)
    cursor.insertBefore(nonbreakingSpace2, null)
    return cursor
  });
  const plugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({
    key: loroCursorPluginKey,
    state: {
      init(_, state) {
        return createDecorations(state, awareness, plugin, createSelection, createCursor);
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
          return createDecorations(newState, awareness, plugin, createSelection, createCursor);
        }

        return prevState.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations: (state) => {
        return plugin.getState(state)
      },
    },
    view: (view) => {
      const awarenessListener = (_: any, origin: string) => {
        setTimeout(() => {
          let tr = view.state.tr;
          tr.setMeta(loroCursorPluginKey, { awarenessUpdated: true });
          view.dispatch(tr);
        }, 0)
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
            loroState.doc as LoroDocType,
            loroState.mapping,
          );
          const focus = absolutePositionToCursor(
            pmRootNode,
            selection.head,
            loroState.doc as LoroDocType,
            loroState.mapping,
          );
          if (
            current == null ||
            current.anchor?.containerId() != anchor?.containerId() ||
            current.anchor?.pos()?.counter != anchor?.pos()?.counter ||
            current.focus?.containerId() != focus?.containerId() ||
            current.focus?.pos()?.counter != focus?.pos()?.counter
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


function absolutePositionToCursor(pmRootNode: Node, anchor: number, doc: LoroDocType, _mapping: LoroNodeMapping): Cursor | undefined {
  const pos = pmRootNode.resolve(anchor);
  const nodeParent = pos.node(pos.depth);
  const offset = pos.parentOffset
  const loroId = WEAK_NODE_TO_LORO_CONTAINER_MAPPING.get(nodeParent);
  if (loroId == null) {
    return;
  }

  const loroMap: LoroNode = doc.getMap(loroId as any);
  const children = loroMap.get(CHILDREN_KEY);
  const text = children.get(0);
  if (text instanceof LoroText) {
    console.log("abs", offset);
    return text.getCursor(offset);
  } else {
    return undefined;
  }
}


function cursorToAbsolutePosition(_pmRootNode: Node, cursor: Cursor, doc: LoroDocType, mapping: LoroNodeMapping): number {
  const textId = cursor.containerId()
  const loroText = doc.getText(textId);
  let pos = doc.getCursorPos(cursor);
  let index = pos.offset;
  console.log("decoded", index);
  let targetChildId = loroText.id;
  let loroNode = loroText.parent()?.parent() as LoroNode | undefined;
  while (loroNode != null) {
    const children = loroNode.get(CHILDREN_KEY);
    if (children instanceof LoroList) {
      const childIds = children.toArray() as LoroNode[];
      for (const iter of childIds) {
        if (iter.id === targetChildId) {
          break;
        }

        const mapped = mapping.get(iter.id);
        if (Array.isArray(mapped)) {
          mapped.forEach(child => {
            index += child.nodeSize;
          })
        } else {
          if (mapped != null) {
            index += mapped.nodeSize;
          } else {
            console.error(childIds, children.toJson())
          }
        }
      }

      targetChildId = loroNode.id;
      loroNode = loroNode.parent()?.parent() as LoroNode | undefined;
    } else {
      throw new Error("Unreachable code");
    }
  }

  console.log("Final", index);
  return index + 1;
}

