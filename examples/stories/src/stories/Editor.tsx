import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { DOMParser, Schema } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { exampleSetup } from "prosemirror-example-setup";
import { useEffect, useRef } from "react";
import {
  CursorEphemeralStore,
  LoroEphemeralCursorPlugin,
  LoroDocType,
  LoroSyncPlugin,
  LoroUndoPlugin,
  redo,
  undo,
} from "loro-prosemirror";
import "./Editor.css";
import { ContainerID, LoroDoc } from "loro-crdt";
import { buildMenuItems } from "./menu";

const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: schema.spec.marks,
});

const doc = DOMParser.fromSchema(mySchema).parse(document.createElement("div"));

/* eslint-disable */
const plugins = exampleSetup({
  schema: mySchema,
  history: false,
  menuContent: buildMenuItems(mySchema).fullMenu as any,
});

export function Editor({
  loro,
  presence,
  onCreateLoro,
  containerId,
}: {
  loro?: LoroDocType;
  presence?: CursorEphemeralStore;
  onCreateLoro?: (loro: LoroDocType) => void;
  containerId?: ContainerID;
}) {
  const editorRef = useRef<null | EditorView>(null);
  const editorDom = useRef(null);
  const loroRef = useRef(loro);
  if (loroRef.current && loro && loroRef.current !== loro) {
    throw new Error("loro ref cannot be changed");
  }

  loroRef.current = loro;

  useEffect(() => {
    if (editorRef.current) return;
    if (!loroRef.current) {
      loroRef.current = new LoroDoc();
      onCreateLoro?.(loroRef.current);
    }

    const all = [
      ...plugins,
      LoroSyncPlugin({ doc: loroRef.current!, containerId }),
      LoroUndoPlugin({ doc: loroRef.current! }),
      keymap({
        "Mod-z": (state) => undo(state, () => {}),
        "Mod-y": (state) => redo(state, () => {}),
        "Mod-Shift-z": (state) => redo(state, () => {}),
      }),
    ];
    if (presence) {
      all.push(LoroEphemeralCursorPlugin(presence, {}));
    }
    editorRef.current = new EditorView(editorDom.current, {
      state: EditorState.create({ doc, plugins: all }),
    });
  }, [presence, onCreateLoro]);

  return (
    <div id="editor" style={{ minHeight: 200, margin: 16 }} ref={editorDom} />
  );
}
