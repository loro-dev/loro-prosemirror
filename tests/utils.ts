import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

export function createEditorState(schema: Schema, content: any): EditorState {
  const doc = schema.nodeFromJSON(content);
  return EditorState.create({
    doc,
    schema,
  });
}
