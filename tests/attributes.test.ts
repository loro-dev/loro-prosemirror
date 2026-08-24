import { describe, expect, test } from "vitest";

import { LoroDoc, type VersionVector } from "loro-crdt";
import { Schema } from "prosemirror-model";

import {
  ROOT_DOC_KEY,
  updateLoroToPmState,
  type LoroDocType,
  type LoroNodeMapping,
} from "../src/lib";

import { createEditorState } from "./utils";

const nullableAttrSchema = new Schema({
  nodes: {
    doc: { content: "block*" },
    paragraph: {
      attrs: { checked: { default: null } },
      content: "inline*",
      group: "block",
    },
    text: { group: "inline" },
  },
});

function opsSince(doc: LoroDoc, vv: VersionVector) {
  return doc
    .exportJsonUpdates(vv)
    .changes.flatMap((change) => change.ops)
    .map((op) => op.content);
}

function withChecked(checked: boolean | null) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { checked },
        content: [{ type: "text", text: "Hello" }],
      },
    ],
  };
}

describe("attributes", () => {
  test("re-syncing an unchanged doc with null attributes emits no ops", () => {
    const loroDoc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();

    updateLoroToPmState(
      loroDoc,
      mapping,
      createEditorState(nullableAttrSchema, withChecked(null)),
    );
    const version = loroDoc.version();

    updateLoroToPmState(
      loroDoc,
      mapping,
      createEditorState(nullableAttrSchema, withChecked(null)),
    );

    expect(opsSince(loroDoc, version)).toEqual([]);
  });

  test("an attribute set back to null is removed", () => {
    const loroDoc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();

    updateLoroToPmState(
      loroDoc,
      mapping,
      createEditorState(nullableAttrSchema, withChecked(true)),
    );
    updateLoroToPmState(
      loroDoc,
      mapping,
      createEditorState(nullableAttrSchema, withChecked(null)),
    );

    expect(loroDoc.toJSON()[ROOT_DOC_KEY].children[0].attributes).toEqual({});
  });
});
