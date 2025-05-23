import {
  type ContainerID,
  Cursor,
  LoroList,
  LoroText,
  type PeerID,
} from "loro-crdt";
import { Node } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Selection } from "prosemirror-state";
import {
  Decoration,
  type DecorationAttrs,
  DecorationSet,
} from "prosemirror-view";

import { CursorAwareness, cursorEq } from "./awareness";
import {
  CHILDREN_KEY,
  type LoroDocType,
  type LoroNode,
  type LoroNodeMapping,
  WEAK_NODE_TO_LORO_CONTAINER_MAPPING,
} from "./lib";
import { loroSyncPluginKey, type LoroSyncPluginState } from "./sync-plugin";

const loroCursorPluginKey = new PluginKey<{ awarenessUpdated: boolean }>(
  "loro-cursor",
);

function createDecorations(
  state: EditorState,
  awareness: CursorAwareness,
  plugin: Plugin<DecorationSet>,
  createSelection: (user: PeerID) => DecorationAttrs,
  createCursor: (user: PeerID) => Element,
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

    const [focus, focusCursorUpdate] = cursorToAbsolutePosition(
      cursor.focus,
      doc as LoroDocType,
      loroState.mapping,
    );
    d.push(Decoration.widget(focus, createCursor(peer as PeerID)));
    if (!cursorEq(cursor.anchor, cursor.focus)) {
      const [anchor, anchorCursorUpdate] = cursorToAbsolutePosition(
        cursor.anchor,
        doc as LoroDocType,
        loroState.mapping,
      );
      d.push(
        Decoration.inline(
          Math.min(anchor, focus),
          Math.max(anchor, focus),
          createSelection(peer as PeerID),
        ),
      );
      if (focusCursorUpdate || anchorCursorUpdate) {
        const existingLocalState = awareness.getLocalState();
        awareness.setLocal({
          ...(existingLocalState?.user && { user: existingLocalState.user }),
          anchor: anchorCursorUpdate || cursor.anchor,
          focus: focusCursorUpdate || cursor.focus,
        });
      }
    } else {
      if (focusCursorUpdate) {
        const existingLocalState = awareness.getLocalState();
        awareness.setLocal({
          ...(existingLocalState?.user && { user: existingLocalState.user }),
          focus: focusCursorUpdate,
          anchor: focusCursorUpdate,
        });
      }
    }
  }

  const decorations = DecorationSet.create(state.doc, d);
  return decorations;
}

export const LoroCursorPlugin = (
  awareness: CursorAwareness,
  options: {
    getSelection?: (state: EditorState) => Selection;
    createCursor?: (user: PeerID) => Element;
    createSelection?: (user: PeerID) => DecorationAttrs;
    user?: { name: string; color: string };
  },
) => {
  const getSelection = options.getSelection || ((state) => state.selection);
  const createSelection = options.createSelection ||
    ((user) => ({
      class: "loro-selection",
      "data-peer": user,
      style: `background-color: rgba(228, 208, 102, 0.5)`,
    }));
  const createCursor = options.createCursor ||
    ((user) => {
      const awarenessData = awareness.getAllStates();
      const cursorUserData = awarenessData[user];
      const cursor = document.createElement("span");
      cursor.classList.add("ProseMirror-loro-cursor");
      cursor.setAttribute(
        "style",
        `border-color: ${cursorUserData.user?.color ?? user.slice(0, 6)}`,
      );
      const userDiv = document.createElement("div");
      userDiv.setAttribute(
        "style",
        `background-color: ${cursorUserData.user?.color ?? user.slice(0, 6)}`,
      );
      userDiv.insertBefore(
        document.createTextNode(cursorUserData.user?.name ?? user.slice(0, 6)),
        null,
      );
      const nonbreakingSpace1 = document.createTextNode("\u2060");
      const nonbreakingSpace2 = document.createTextNode("\u2060");
      cursor.insertBefore(nonbreakingSpace1, null);
      cursor.insertBefore(userDiv, null);
      cursor.insertBefore(nonbreakingSpace2, null);
      return cursor;
    });
  const plugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({
    key: loroCursorPluginKey,
    state: {
      init(_, state) {
        return createDecorations(
          state,
          awareness,
          plugin,
          createSelection,
          createCursor,
        );
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
          return createDecorations(
            newState,
            awareness,
            plugin,
            createSelection,
            createCursor,
          );
        }

        return prevState.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations: (state) => {
        return plugin.getState(state);
      },
    },
    view: (view) => {
      const awarenessListener = (_: any, origin: string) => {
        if (origin !== "local") {
          setTimeout(() => {
            let tr = view.state.tr;
            tr.setMeta(loroCursorPluginKey, { awarenessUpdated: true });
            view.dispatch(tr);
          }, 0);
        }
      };

      const updateCursorInfo = () => {
        // This will be called whenever the view is updated
        // We may need to optimize it
        const loroState = loroSyncPluginKey.getState(view.state);
        const current = awareness.getLocal();
        if (loroState?.doc == null) {
          return;
        }

        const pmRootNode = view.state.doc;
        if (view.hasFocus()) {
          const selection = getSelection(view.state);
          const { anchor, focus } = convertPmSelectionToCursors(
            pmRootNode,
            selection,
            loroState,
          );
          if (
            current == null ||
            !cursorEq(current.anchor, anchor) ||
            !cursorEq(current.focus, focus)
          ) {
            awareness.setLocal({
              user: options.user,
              anchor,
              focus,
            });
          } else {
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

export function convertPmSelectionToCursors(
  pmRootNode: Node,
  selection: Selection,
  loroState: LoroSyncPluginState,
) {
  const anchor = absolutePositionToCursor(
    pmRootNode,
    selection.anchor,
    loroState.doc as LoroDocType,
    loroState.mapping,
  );
  const focus = selection.head == selection.anchor
    ? anchor
    : absolutePositionToCursor(
      pmRootNode,
      selection.head,
      loroState.doc as LoroDocType,
      loroState.mapping,
    );
  return { anchor, focus };
}

function getByValue(map: Map<ContainerID, Node | Node[]>, searchValue: Node) {
  for (let [key, value] of map.entries()) {
    if (value === searchValue) return key;
  }
}

function absolutePositionToCursor(
  pmRootNode: Node,
  anchor: number,
  doc: LoroDocType,
  mapping: LoroNodeMapping,
): Cursor | undefined {
  const pos = pmRootNode.resolve(anchor);
  const nodeParent = pos.node(pos.depth);
  const offset = pos.parentOffset;

  const loroId = WEAK_NODE_TO_LORO_CONTAINER_MAPPING.get(nodeParent) ??
    getByValue(mapping, nodeParent);
  if (!loroId) {
    if (anchor > 1) {
      console.error("Cannot find the loroNode");
    }
    return;
  }

  const loroMap: LoroNode = doc.getMap(loroId as any);
  const children = loroMap.get(CHILDREN_KEY);
  if (children.length == 0) {
    // This is a new line, so we can use the list cursor instead
    return children.getCursor(0);
  }

  let index = offset;
  let childIndex = 0;
  while (index >= 0 && childIndex < children.length) {
    const child = children.get(childIndex);
    childIndex += 1;
    if (child instanceof LoroText) {
      if (child.length >= index) {
        return child.getCursor(index);
      } else {
        index -= child.length;
      }
    } else {
      if (index == 0) {
        // This happens when user selects an image or a horizontal rule
        if (childIndex < children.length) {
          // Select next text node
          index += 1;
        }
      }

      index -= 1;
    }
  }

  // Selection is not on text
  return undefined;
}

export function cursorToAbsolutePosition(
  cursor: Cursor,
  doc: LoroDocType,
  mapping: LoroNodeMapping,
): [number, Cursor | undefined] {
  const containerId = cursor.containerId();
  let index = -1;
  let targetChildId: ContainerID;
  let loroNode: LoroNode | undefined;
  let update: Cursor | undefined;
  if (containerId.endsWith("List")) {
    const loroList = doc.getContainerById(containerId) as LoroList | undefined;
    if (!loroList) {
      return [1, undefined];
    }

    const parentNode = loroList.parent();
    if (!parentNode) {
      return [1, undefined];
    }

    targetChildId = parentNode.id;
    loroNode = parentNode.parent()?.parent() as LoroNode | undefined;
    index = 0;
  } else {
    const loroText = doc.getText(containerId);
    const pos = doc.getCursorPos(cursor);
    update = pos.update;
    index += pos.offset;
    targetChildId = loroText.id;
    loroNode = loroText.parent()?.parent() as LoroNode | undefined;
  }
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
          mapped.forEach((child) => {
            index += child.nodeSize;
          });
        } else {
          if (mapped != null) {
            index += mapped.nodeSize;
          } else {
            console.error(childIds, children.toJSON());
          }
        }
      }

      targetChildId = loroNode.id;
      loroNode = loroNode.parent()?.parent() as LoroNode | undefined;
      index += 1;
    } else {
      throw new Error("Unreachable code");
    }
  }

  return [index, update];
}
