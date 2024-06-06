# Prosemirror Binding for Loro

- Sync document state with Loro
- Sync cursors with Loro's Awareness and [Cursor](https://loro.dev/docs/tutorial/cursor)
- Undo/Redo in collaborative editing

```ts
import {
  CursorAwareness,
  LoroCursorPlugin,
  LoroSyncPlugin,
  LoroUndoPlugin,
  undo,
  redo,
} from "loro-prosemirror";
import { Loro } from "loro-crdt";

const doc = new Loro();
const awareness = new CursorAwareness(doc.peerIdStr);
const plugins = [
  ...pmPlugins,
  LoroSyncPlugin({ doc }),
  LoroUndoPlugin({ doc }),
  keymap({
    "Mod-z": state => undo(state, () => {}),
    "Mod-y": state => redo(state, () => {}),
    "Mod-Shift-z": state => redo(state, () => {}),
  }),
  LoroCursorPlugin(awareness, {}),
];
const editor = new EditorView(editorDom, {
  state: EditorState.create({ doc, plugins }),
});
```


