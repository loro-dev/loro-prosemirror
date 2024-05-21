import { Loro, UndoManager } from "loro-crdt";
import { EditorState, Plugin, PluginKey, StateField, TextSelection, Transaction } from "prosemirror-state";

export interface LoroUndoPluginProps {
  doc: Loro;
  undoManager?: UndoManager
}

export const loroUndoPluginKey = new PluginKey<LoroUndoPluginState>("loro-undo");

interface LoroUndoPluginState {
  undoManager: UndoManager,
  canUndo: boolean,
  canRedo: boolean
}

export const LoroUndoPlugin = (props: LoroUndoPluginProps): Plugin => {
  return new Plugin({
    key: loroUndoPluginKey,
    state: {
      init: (config, editorState): LoroUndoPluginState => {
        const undoManager = props.undoManager || new UndoManager(props.doc, {});
        undoManager.addExcludeOriginPrefix("sys:init")
        return {
          undoManager,
          canUndo: undoManager.canUndo(),
          canRedo: undoManager.canRedo(),
        }
      },
      apply: (tr, state, oldEditorState, newEditorState) => {
        const undoState = loroUndoPluginKey.getState(newEditorState);
        if (!undoState) {
          return state;
        }

        const canUndo = undoState.undoManager.canUndo();
        const canRedo = undoState.undoManager.canRedo();
        if (canUndo !== state.canUndo || canRedo !== state.canRedo) {
          return {
            ...state,
            canUndo,
            canRedo
          }
        }

        return state;
      },
    } as StateField<LoroUndoPluginState>,
  });
};

export function canUndo(state: EditorState): boolean {
  const undoState = loroUndoPluginKey.getState(state);
  return undoState?.undoManager.canUndo() || false;
}

export function canRedo(state: EditorState): boolean {
  const undoState = loroUndoPluginKey.getState(state);
  return undoState?.undoManager.canRedo() || false;
}

export function undo(state: EditorState, dispatch: (tr: Transaction) => void): boolean {
  const undoState = loroUndoPluginKey.getState(state);
  if (!undoState || !undoState.undoManager.canUndo()) {
    return false;
  }

  if (!undoState.undoManager.undo()) {
    const emptyTr = state.tr;
    dispatch(emptyTr)
    return false
  }

  return true
}


export function redo(state: EditorState, dispatch: (tr: Transaction) => void): boolean {
  const undoState = loroUndoPluginKey.getState(state);
  if (!undoState || !undoState.undoManager.canRedo()) {
    return false;
  }

  if (!undoState.undoManager.redo()) {
    const emptyTr = state.tr;
    dispatch(emptyTr)
    return false
  }

  return true
}

