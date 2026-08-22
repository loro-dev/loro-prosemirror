import { describe, expect, test } from "vitest";

import { LoroDoc } from "loro-crdt";
import { Schema } from "prosemirror-model";

import { configLoroTextStyle } from "../src/text-style";

const schema = new Schema({
  nodes: {
    doc: { content: "block*" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    // Like most real-world marks (bold, italic, code, ...), `inclusive` is
    // left unset, which ProseMirror treats as `true`.
    bold: {},
    inclusiveMark: { inclusive: true },
    exclusiveMark: { inclusive: false },
  },
});

describe("configLoroTextStyle", () => {
  test("marks with unset inclusive expand like ProseMirror does", () => {
    const doc = new LoroDoc();
    configLoroTextStyle(doc, schema);

    const text = doc.getText("text");
    text.insert(0, "hello");
    text.mark({ start: 0, end: 5 }, "bold", true);
    // ProseMirror extends default-inclusive marks over text typed at their
    // end, so Loro must do the same or the two sides diverge on every
    // keystroke of styled typing.
    text.insert(5, "!");
    expect(text.toDelta()).toEqual([
      { insert: "hello!", attributes: { bold: true } },
    ]);
  });

  test("explicitly inclusive marks expand", () => {
    const doc = new LoroDoc();
    configLoroTextStyle(doc, schema);

    const text = doc.getText("text");
    text.insert(0, "hello");
    text.mark({ start: 0, end: 5 }, "inclusiveMark", true);
    text.insert(5, "!");
    expect(text.toDelta()).toEqual([
      { insert: "hello!", attributes: { inclusiveMark: true } },
    ]);
  });

  test("explicitly exclusive marks do not expand", () => {
    const doc = new LoroDoc();
    configLoroTextStyle(doc, schema);

    const text = doc.getText("text");
    text.insert(0, "hello");
    text.mark({ start: 0, end: 5 }, "exclusiveMark", true);
    text.insert(5, "!");
    expect(text.toDelta()).toEqual([
      { insert: "hello", attributes: { exclusiveMark: true } },
      { insert: "!" },
    ]);
  });
});
