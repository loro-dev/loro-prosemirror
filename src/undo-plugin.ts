import { Cursor, Loro, UndoManager } from "loro-crdt";
import { EditorState, Plugin, PluginKey, StateField, TextSelection, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { convertPmSelectionToCursors, cursorToAbsolutePosition } from "./cursor-plugin";
import { loroSyncPluginKey } from "./sync-plugin";

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

type Cursors = { anchor: Cursor | null, focus: Cursor | null };
export const LoroUndoPlugin = (props: LoroUndoPluginProps): Plugin => {
  const undoManager = props.undoManager || new UndoManager(props.doc, {});
  let lastSelection: Cursors = {
    anchor: null,
    focus: null
  }
  return new Plugin({
    key: loroUndoPluginKey,
    state: {
      init: (config, editorState): LoroUndoPluginState => {
        undoManager.addExcludeOriginPrefix("sys:init")
        return {
          undoManager,
          canUndo: undoManager.canUndo(),
          canRedo: undoManager.canRedo(),
        }
      },
      apply: (tr, state, oldEditorState, newEditorState) => {
        const undoState = loroUndoPluginKey.getState(oldEditorState);
        const loroState = loroSyncPluginKey.getState(oldEditorState);
        if (!undoState || !loroState) {
          return state;
        }

        const canUndo = undoState.undoManager.canUndo();
        const canRedo = undoState.undoManager.canRedo();
        const { anchor, focus } = convertPmSelectionToCursors(oldEditorState.doc, oldEditorState.selection, loroState);
        lastSelection = {
          anchor: anchor ?? null,
          focus: focus ?? null
        }
        return {
          ...state,
          canUndo,
          canRedo,
        }
      },
    } as StateField<LoroUndoPluginState>,

    view: (view: EditorView) => {
      // When in the undo/redo loop, the new undo/redo stack item should restore the selection
      // to the state it was in before the item that was popped two steps ago from the stack.
      //
      //                          ┌────────────┐
      //                          │Selection 1 │                                       
      //                          └─────┬──────┘                                       
      //                                │   Some                                       
      //                                ▼   ops                                        
      //                          ┌────────────┐                                       
      //                          │Selection 2 │                                       
      //                          └─────┬──────┘                                       
      //                                │   Some                                       
      //                                ▼   ops                                        
      //                          ┌────────────┐                                       
      //                          │Selection 3 │◁ ─ ─ ─ ─ ─ ─ ─  Restore  ─ ─ ─        
      //                          └─────┬──────┘                               │       
      //                                │                                              
      //                                │                                      │       
      //                                │                              ┌ ─ ─ ─ ─ ─ ─ ─ 
      //           Enter the            │   Undo ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─▶   Push Redo   │
      //           undo/redo ─ ─ ─ ▶    ▼                              └ ─ ─ ─ ─ ─ ─ ─ 
      //             loop         ┌────────────┐                               │       
      //                          │Selection 2 │◁─ ─ ─  Restore  ─                     
      //                          └─────┬──────┘                  │            │       
      //                                │                                              
      //                                │                         │            │       
      //                                │                 ┌ ─ ─ ─ ─ ─ ─ ─              
      //                                │   Undo ─ ─ ─ ─ ▶   Push Redo   │     │       
      //                                ▼                 └ ─ ─ ─ ─ ─ ─ ─              
      //                          ┌────────────┐                  │            │       
      //                          │Selection 1 │                                       
      //                          └─────┬──────┘                  │            │       
      //                                │   Redo ◀ ─ ─ ─ ─ ─ ─ ─ ─                     
      //                                ▼                                      │       
      //                          ┌────────────┐                                       
      //         ┌   Restore   ─ ▷│Selection 2 │                               │       
      //                          └─────┬──────┘                                       
      //         │                      │                                      │       
      // ┌ ─ ─ ─ ─ ─ ─ ─                │                                              
      //    Push Undo   │◀─ ─ ─ ─ ─ ─ ─ │   Redo ◀ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘       
      // └ ─ ─ ─ ─ ─ ─ ─                ▼                                              
      //         │                ┌────────────┐                                       
      //                          │Selection 3 │                                       
      //         │                └─────┬──────┘                                       
      //          ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶ │   Undo                                       
      //                                ▼                                              
      //                          ┌────────────┐                                       
      //                          │Selection 2 │                                       
      //                          └────────────┘                                       
      //
      // Because users may change the selections during the undo/redo loop, it's 
      // more stable to keep the selection stored in the last stack item
      // rather than using the current selection directly.

      let lastUndoRedoLoopSelection: Cursors | null = null;
      let justPopped = false;
      props.doc.subscribe(event => {
        if (event.by === "import") {
          lastUndoRedoLoopSelection = null;
        }
      });

      undoManager.setOnPush((isUndo, _counterRange) => {
        if (!justPopped) {
          // A new op is being pushed to the undo stack, so it breaks the 
          // undo/redo loop.
          console.assert(isUndo);
          lastUndoRedoLoopSelection = null;
        }

        const loroState = loroSyncPluginKey.getState(view.state);
        if (loroState?.doc == null) {
          return {
            value: null,
            cursors: []
          };
        }

        const cursors: Cursor[] = [];
        if (lastSelection.anchor) {
          cursors.push(lastSelection.anchor);
        }
        if (lastSelection.focus) {
          cursors.push(lastSelection.focus);
        }

        return {
          value: null,
          // The undo manager will internally transform the cursors.
          // Undo/redo operations may recreate deleted content, so we need to remap
          // the cursors to their new positions. Additionally, if containers are deleted
          // and recreated, they also need remapping. Remote changes to the document
          // should be considered in these transformations.
          cursors
        }
      })
      undoManager.setOnPop((isUndo, meta, counterRange) => {
        // After this call, the `onPush` will be called immediately.
        // The immediate `onPush` will contain the inverse operations that undone the effect caused by the current `onPop`
        const loroState = loroSyncPluginKey.getState(view.state);
        if (loroState?.doc == null) {
          return;
        }

        const anchor = meta.cursors[0] ?? null;
        const focus = meta.cursors[1] ?? null
        if (anchor == null) {
          return;
        }

        if (lastUndoRedoLoopSelection) {
          // We overwrite the lastSelection so that the corresponding `onPush`
          // will restore the selection to the state it was in before the
          // item that was popped two steps ago from the stack.
          lastSelection = lastUndoRedoLoopSelection;
        }

        lastUndoRedoLoopSelection = {
          anchor,
          focus
        };

        justPopped = true;
        setTimeout(() => {
          try {
            justPopped = false;
            const anchorPos = cursorToAbsolutePosition(anchor, loroState.doc, loroState.mapping)[0];
            const focusPos = focus && cursorToAbsolutePosition(focus, loroState.doc, loroState.mapping)[0];
            const selection = TextSelection.create(view.state.doc, anchorPos, focusPos ?? undefined)
            view.dispatch(view.state.tr.setSelection(selection));
          } catch (e) {
            console.error(e);
          }
        }, 0)
      });
      return {
        destroy: () => {
          undoManager.setOnPop();
          undoManager.setOnPush();
        }
      }

    }
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

