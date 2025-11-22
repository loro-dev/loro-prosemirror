# Prosemirror Binding for Loro

- Sync document state with Loro
- Sync cursors with Loro's EphemeralStore (preferred) or legacy Awareness and
  [Cursor](https://loro.dev/docs/tutorial/cursor)
- Undo/Redo in collaborative editing
- [🎨 Try it online](https://main--6661e86e215da40180d90507.chromatic.com)

```ts
import {
  CursorEphemeralStore,
  LoroEphemeralCursorPlugin,
  LoroSyncPlugin,
  LoroUndoPlugin,
  redo,
  undo,
} from "loro-prosemirror";
import { LoroDoc } from "loro-crdt";
import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";

const doc = new LoroDoc();
const presence = new CursorEphemeralStore(doc.peerIdStr);

const plugins = [
  ...pmPlugins,
  LoroSyncPlugin({ doc }),
  LoroUndoPlugin({ doc }),
  keymap({
    "Mod-z": undo,
    "Mod-y": redo,
    "Mod-Shift-z": redo,
  }),
  LoroEphemeralCursorPlugin(presence, {}),
];
const editor = new EditorView(editorDom, {
  state: EditorState.create({ doc, plugins }),
});
```

https://github.com/loro-dev/prosemirror/assets/18425020/d0f01760-b76c-43b5-b7f7-b0b224130d9d
