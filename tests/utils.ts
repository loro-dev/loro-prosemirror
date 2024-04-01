import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import {
  LoroNodeMapping,
  getLoroMapAttributes,
  getLoroMapChildren,
} from "../src";
import { Loro, LoroList, LoroMap, LoroText } from "loro-crdt";

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

export function insertLoroMap(parent: LoroList, nodeName: string): LoroMap {
  const obj = parent.insertContainer(parent.length, new LoroMap());
  setupLoroMap(obj, nodeName);
  return obj;
}

export function setupLoroMap(obj: LoroMap, nodeName: string): void {
  obj.set("nodeName", nodeName);
  getLoroMapChildren(obj);
  getLoroMapAttributes(obj);
}

export function oneMs(): Promise<void> {
  return new Promise((r) => setTimeout(r));
}
