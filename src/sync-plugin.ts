import {
  type ContainerID,
  LoroDoc,
  type LoroEventBatch,
  LoroMap,
  type Subscription,
} from "loro-crdt";
import { Fragment, Slice } from "prosemirror-model";
import {
  EditorState,
  Plugin,
  PluginKey,
  type StateField,
  TextSelection,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import {
  clearChangedNodes,
  createNodeFromLoroObj,
  type LoroDocType,
  type LoroNodeContainerType,
  type LoroNodeMapping,
  ROOT_DOC_KEY,
  updateLoroToPmState,
} from "./lib";
import { configLoroTextStyle } from "./text-style";
import {
  convertPmSelectionToCursors,
  cursorToAbsolutePosition,
} from "./cursor-plugin";
import { loroUndoPluginKey } from "./undo-plugin";

export const loroSyncPluginKey = new PluginKey<LoroSyncPluginState>(
  "loro-sync",
);

type PluginTransactionType =
  | {
    type: "doc-changed";
  }
  | {
    type: "non-local-updates";
  }
  | {
    type: "update-state";
    state: Partial<LoroSyncPluginState>;
  };

export interface LoroSyncPluginProps {
  doc: LoroDocType;
  mapping?: LoroNodeMapping;
  containerId?: ContainerID;
}

export interface LoroSyncPluginState extends LoroSyncPluginProps {
  changedBy: "local" | "import" | "checkout";
  mapping: LoroNodeMapping;
  snapshot?: LoroDoc | null;
  view?: EditorView;
  containerId?: ContainerID;
  docSubscription?: Subscription | null;
}

export const LoroSyncPlugin = (props: LoroSyncPluginProps): Plugin => {
  return new Plugin({
    key: loroSyncPluginKey,
    props: {
      editable: (state) => {
        const syncState = loroSyncPluginKey.getState(state);
        return syncState?.snapshot == null;
      },
    },
    state: {
      init: (config, editorState): LoroSyncPluginState => {
        configLoroTextStyle(props.doc, editorState.schema);

        return {
          doc: props.doc,
          mapping: props.mapping ?? new Map(),
          changedBy: "local",
          containerId: props.containerId,
        };
      },
      apply: (tr, state, oldEditorState, newEditorState) => {
        const meta = tr.getMeta(
          loroSyncPluginKey,
        ) as PluginTransactionType | null;
        const undoState = loroUndoPluginKey.getState(oldEditorState);

        if (meta?.type === "non-local-updates") {
          state.changedBy = "import";
        } else {
          state.changedBy = "local";
        }
        switch (meta?.type) {
          case "doc-changed":
            if (!(undoState?.isUndoing.current)) {
              updateLoroToPmState(
                state.doc as LoroDocType,
                state.mapping,
                newEditorState,
                props.containerId,
              );
            }
            break;
          case "update-state":
            state = { ...state, ...meta.state };
            state.doc.commit({
              origin: "sys:init",
              timestamp: Date.now(),
            });
            break;
          default:
            break;
        }
        return state;
      },
    } as StateField<LoroSyncPluginState>,
    appendTransaction: (transactions, oldEditorState, newEditorState) => {
      if (transactions.some((tr) => tr.docChanged)) {
        return newEditorState.tr.setMeta(loroSyncPluginKey, {
          type: "doc-changed",
        });
      }
      return null;
    },
    view: (view: EditorView) => {
      const timeoutId = setTimeout(() => init(view), 0);
      return {
        update: (view: EditorView, prevState: EditorState) => {},
        destroy: () => {
          clearTimeout(timeoutId);
        },
      };
    },
  });
};

// This is called when the plugin's state is associated with an editor view
function init(view: EditorView) {
  const state = loroSyncPluginKey.getState(view.state) as LoroSyncPluginState;

  let docSubscription = state.docSubscription;

  docSubscription?.();

  if (state.containerId) {
    docSubscription = state.doc!.getContainerById(state.containerId)!
      .subscribe((event) => {
        updateNodeOnLoroEvent(view, event);
      });
  } else {
    docSubscription = state.doc.subscribe((event) =>
      updateNodeOnLoroEvent(view, event)
    );
  }

  const innerDoc = state.containerId
    ? (state.doc.getContainerById(
      state.containerId,
    ) as LoroMap<LoroNodeContainerType>)
    : (state.doc as LoroDocType).getMap(ROOT_DOC_KEY);

  const mapping: LoroNodeMapping = new Map();
  if (innerDoc.size === 0) {
    // Empty doc
    const tr = view.state.tr.delete(0, view.state.doc.content.size);
    tr.setMeta(loroSyncPluginKey, {
      type: "update-state",
      state: { mapping, docSubscription, snapshot: null },
    });
    view.dispatch(tr);
  } else {
    const schema = view.state.schema;
    // Create node from loro object
    const node = createNodeFromLoroObj(
      schema,
      innerDoc as LoroMap<LoroNodeContainerType>,
      mapping,
    );
    const tr = view.state.tr.replace(
      0,
      view.state.doc.content.size,
      new Slice(Fragment.from(node), 0, 0),
    );
    tr.setMeta(loroSyncPluginKey, {
      type: "update-state",
      state: { mapping, docSubscription, snapshot: null },
    });
    view.dispatch(tr);
  }
}

function updateNodeOnLoroEvent(view: EditorView, event: LoroEventBatch) {
  const state = loroSyncPluginKey.getState(view.state) as LoroSyncPluginState;
  state.changedBy = event.by;
  if (event.by === "local" && event.origin !== "undo") {
    return;
  }

  const mapping = state.mapping;
  clearChangedNodes(state.doc as LoroDocType, event, mapping);
  const node = createNodeFromLoroObj(
    view.state.schema,
    state.containerId
      ? (state.doc.getContainerById(
        state.containerId,
      ) as LoroMap<LoroNodeContainerType>)
      : (state.doc as LoroDocType).getMap(ROOT_DOC_KEY),
    mapping,
  );
  const { anchor, focus } = convertPmSelectionToCursors(
    view.state.doc,
    view.state.selection,
    state,
  );

  let tr = view.state.tr.replace(
    0,
    view.state.doc.content.size,
    new Slice(Fragment.from(node), 0, 0),
  );

  tr.setMeta(loroSyncPluginKey, {
    type: "non-local-updates",
  });
  view.dispatch(tr);
  Promise.resolve().then(() => {
    if (anchor && focus) {
      const state = loroSyncPluginKey.getState(
        view.state,
      ) as LoroSyncPluginState;
      const anchorPos = cursorToAbsolutePosition(
        anchor,
        state.doc,
        state.mapping,
      )[0];
      const focusPos = focus &&
        cursorToAbsolutePosition(
          focus,
          state.doc,
          state.mapping,
        )[0];
      const selection = TextSelection.create(
        view.state.tr.doc,
        anchorPos,
        focusPos ?? undefined,
      );
      const tr = view.state.tr.setSelection(selection);
      view.dispatch(tr);
    }
  });
}
