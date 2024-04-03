import { Loro, LoroEventBatch, LoroMap, LoroText } from "loro-crdt";
import {
  Plugin,
  PluginKey,
  TextSelection,
  StateField,
  EditorState,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Slice, Fragment } from "prosemirror-model";
import {
  LoroNodeMapping,
  clearChangedNodes,
  createNodeFromLoroObj,
  updateLoroOnPmChange as updateLoroOnPmChange,
} from "./lib";

export const loroSyncPluginKey = new PluginKey<LoroSyncPluginState>("loro-sync");

type PluginTransactionType =
  | {
    type: "doc-changed";
  }
  | {
    type: "update-state";
    state: Partial<LoroSyncPluginState>;
  };

export interface LoroSyncPluginProps {
  doc: Loro;
  mapping?: LoroNodeMapping;
}

interface LoroSyncPluginState extends LoroSyncPluginProps {
  mapping: LoroNodeMapping;
  snapshot?: Loro | null;
  view?: EditorView;
  docSubscription?: number | null;
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
      init: (config, editorState): LoroSyncPluginState => ({
        doc: props.doc,
        mapping: props.mapping ?? new Map(),
      }),
      apply: (tr, state, oldEditorState, newEditorState) => {
        const meta = tr.getMeta(
          loroSyncPluginKey,
        ) as PluginTransactionType | null;
        switch (meta?.type) {
          case "doc-changed":
            updateLoroOnPmChange(state.doc, state.mapping, oldEditorState, newEditorState);
            break;
          case "update-state":
            state = { ...state, ...meta.state };
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
        update: (view: EditorView, prevState: EditorState) => { },
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
  if (docSubscription != null) {
    state.doc.unsubscribe(docSubscription);
  }
  docSubscription = state.doc.subscribe((event) => updateNodeOnLoroEvent(view, event));

  const innerDoc = state.doc.getMap("doc");
  const mapping: LoroNodeMapping = new Map();
  const schema = view.state.schema;
  const node = createNodeFromLoroObj(schema, innerDoc, mapping);
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

function updateNodeOnLoroEvent(view: EditorView, event: LoroEventBatch) {
  if (event.local) {
    return;
  }

  const state = loroSyncPluginKey.getState(view.state) as LoroSyncPluginState;
  const mapping = state.mapping;

  clearChangedNodes(state.doc, event, mapping);
  const node = createNodeFromLoroObj(
    view.state.schema,
    state.doc.getMap("doc"),
    mapping,
  );
  const tr = view.state.tr.replace(
    0,
    view.state.doc.content.size,
    new Slice(Fragment.from(node), 0, 0),
  );
  view.dispatch(tr);
}
