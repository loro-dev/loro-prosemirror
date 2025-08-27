import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import {
  type LoroNode,
  getLoroMapAttributes,
  getLoroMapChildren,
} from "../src/lib";
import { LoroList, LoroMap, LoroText } from "loro-crdt";

export function createEditorState(schema: Schema, content: any): EditorState {
  const doc = schema.nodeFromJSON(content);
  return EditorState.create({
    doc,
    schema,
  });
}

export function insertLoroText(parent: LoroList): LoroText {
  return parent.insertContainer(parent.length, new LoroText());
}

export function insertLoroMap(parent: LoroList, nodeName: string): LoroNode {
  const obj = parent.insertContainer(parent.length, new LoroMap());
  setupLoroMap(obj, nodeName);
  return obj as unknown as LoroNode;
}

export function setupLoroMap(obj: LoroMap, nodeName: string): void {
  obj.set("nodeName", nodeName);
  getLoroMapChildren(obj as unknown as LoroNode);
  getLoroMapAttributes(obj as unknown as LoroNode);
}

export function oneMs(): Promise<void> {
  return new Promise((r) => setTimeout(r));
}
