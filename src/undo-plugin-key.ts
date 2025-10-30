import type { LoroDoc, UndoManager } from "loro-crdt";
import { PluginKey } from "prosemirror-state";

export const loroUndoPluginKey = new PluginKey<LoroUndoPluginState>(
  "loro-undo",
);

export interface LoroUndoPluginProps {
  doc: LoroDoc;
  undoManager?: UndoManager;
}

export interface LoroUndoPluginState {
  undoManager: UndoManager;
  canUndo: boolean;
  canRedo: boolean;
  isUndoing: { current: boolean };
}
