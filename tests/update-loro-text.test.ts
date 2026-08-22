import { describe, expect, test } from "vitest";

import { LoroDoc, type VersionVector } from "loro-crdt";

import {
  createLoroText,
  updateLoroText,
  type LoroNodeMapping,
} from "../src/lib";

import { schema } from "./schema";

// The op positions below are entity indices (they count style anchors as
// well as characters), so the tests assert op types and styles rather than
// exact positions.
function opsSince(doc: LoroDoc, vv: VersionVector) {
  return doc
    .exportJsonUpdates(vv)
    .changes.flatMap((change) => change.ops)
    .map((op) => op.content);
}

// Sets up a LoroText holding "hello bold" with "bold" marked bold, mirroring
// a ProseMirror paragraph [text("hello "), bold(text("bold"))].
function setup(expand: "after" | "none" = "after") {
  const doc = new LoroDoc();
  doc.configTextStyle({ bold: { expand } });
  const mapping: LoroNodeMapping = new Map();
  const nodes = [
    schema.text("hello "),
    schema.text("bold", [schema.mark("bold")]),
  ];
  const text = createLoroText(doc.getList("children"), null, nodes, mapping);
  doc.commit();
  return { doc, text };
}

describe("updateLoroText", () => {
  test("typing at the end of a styled run emits a single insert op", () => {
    const { doc, text } = setup();
    const vv = doc.version();

    // ProseMirror extended the (inclusive) bold mark over the typed "!".
    updateLoroText(
      text,
      [schema.text("hello "), schema.text("bold!", [schema.mark("bold")])],
      new Map(),
    );
    doc.commit();

    expect(text.toDelta()).toEqual([
      { insert: "hello " },
      { insert: "bold!", attributes: { bold: {} } },
    ]);
    expect(opsSince(doc, vv)).toEqual([
      { type: "insert", pos: expect.any(Number), text: "!" },
    ]);
  });

  test("deleting styled text emits a single delete op", () => {
    const { doc, text } = setup();
    const vv = doc.version();

    updateLoroText(
      text,
      [schema.text("hello "), schema.text("bol", [schema.mark("bold")])],
      new Map(),
    );
    doc.commit();

    expect(text.toDelta()).toEqual([
      { insert: "hello " },
      { insert: "bol", attributes: { bold: {} } },
    ]);
    expect(opsSince(doc, vv)).toEqual([
      {
        type: "delete",
        pos: expect.any(Number),
        len: 1,
        start_id: expect.any(String),
      },
    ]);
  });

  test("unchanged text emits no ops at all", () => {
    const { doc, text } = setup();
    const vv = doc.version();

    updateLoroText(
      text,
      [schema.text("hello "), schema.text("bold", [schema.mark("bold")])],
      new Map(),
    );
    doc.commit();

    expect(opsSince(doc, vv)).toEqual([]);
  });

  test("removing a mark unmarks only the range that had it", () => {
    const { doc, text } = setup();
    const vv = doc.version();

    updateLoroText(text, [schema.text("hello bold")], new Map());
    doc.commit();

    expect(text.toString()).toBe("hello bold");
    expect(text.toDelta().every((delta) => delta.attributes == null)).toBe(
      true,
    );
    expect(opsSince(doc, vv)).toEqual([
      {
        type: "mark",
        // Entity range covering "bold" only; "hello " is left untouched.
        start: 6,
        end: expect.any(Number),
        style_key: "bold",
        style_value: null,
        info: expect.any(Number),
      },
      { type: "mark_end" },
    ]);
  });

  test("repairs marks the text diff could not carry over", () => {
    // With expand "none" the "!" inserted by the text diff does not inherit
    // the bold mark, so a style op over just that range is genuinely needed.
    const { doc, text } = setup("none");
    const vv = doc.version();

    updateLoroText(
      text,
      [schema.text("hello "), schema.text("bold!", [schema.mark("bold")])],
      new Map(),
    );
    doc.commit();

    expect(text.toDelta()).toEqual([
      { insert: "hello " },
      { insert: "bold!", attributes: { bold: {} } },
    ]);
    expect(opsSince(doc, vv)).toEqual([
      { type: "insert", pos: expect.any(Number), text: "!" },
      {
        type: "mark",
        start: expect.any(Number),
        end: expect.any(Number),
        style_key: "bold",
        style_value: {},
        info: expect.any(Number),
      },
      { type: "mark_end" },
    ]);
  });
});
