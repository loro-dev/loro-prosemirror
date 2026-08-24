import { describe, expect, test } from "vitest";

import { LoroDoc, LoroMap } from "loro-crdt";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";

import {
  CHILDREN_KEY,
  updateLoroToPmState,
  type LoroDocType,
  type LoroNodeMapping,
} from "../src/lib";
import {
  convertPmSelectionToCursors,
  cursorToAbsolutePosition,
} from "../src/cursor/common";

// A schema with an inline hard break, so a single paragraph can contain more
// than one LoroText leaf (e.g. "abc" <break> "de"), as happens after
// shift+enter. The default test schema has no inline leaf, so this case was
// never exercised.
const schema = new Schema({
  nodes: {
    doc: { content: "block*" },
    paragraph: { content: "inline*", group: "block" },
    hardBreak: { inline: true, group: "inline", selectable: false },
    text: { group: "inline" },
  },
  marks: {},
});

function editorStateFrom(content: unknown): EditorState {
  return EditorState.create({ doc: schema.nodeFromJSON(content), schema });
}

describe("absolutePositionToCursor across multiple text leaves", () => {
  test("a single text run still round-trips (sanity)", () => {
    const editorState = editorStateFrom({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "abc" }] },
      ],
    });
    const doc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();
    updateLoroToPmState(doc, mapping, editorState);
    const loroState = { doc, mapping } as never;

    const target = 2; // "a|bc"
    const { anchor } = convertPmSelectionToCursors(
      editorState.doc,
      TextSelection.create(editorState.doc, target),
      loroState,
    );
    expect(anchor).toBeTruthy();
    const [pos] = cursorToAbsolutePosition(anchor!, doc, mapping);
    expect(pos).toBe(target);
  });

  test("a caret in the second run (after a hard break) round-trips", () => {
    const editorState = editorStateFrom({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "abc" },
            { type: "hardBreak" },
            { type: "text", text: "de" },
          ],
        },
      ],
    });
    const doc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();
    updateLoroToPmState(doc, mapping, editorState);
    const loroState = { doc, mapping } as never;

    // Absolute PM positions: paragraph opens at 0, "abc" = 1..4, the hardBreak
    // leaf occupies 4..5, "de" = 5..7. A caret between "d" and "e" is pos 6.
    // Before the fix, absolutePositionToCursor returned a cursor on the FIRST
    // text leaf ("abc") with an out-of-range offset, so this did not round-trip.
    const target = 6;
    const { anchor } = convertPmSelectionToCursors(
      editorState.doc,
      TextSelection.create(editorState.doc, target),
      loroState,
    );
    expect(anchor).toBeTruthy();
    const [pos] = cursorToAbsolutePosition(anchor!, doc, mapping);
    expect(pos).toBe(target);
  });
});

describe("cursorToAbsolutePosition with a nested editor container", () => {
  test("resolves a position when the bound container is not the doc root", () => {
    const doc: LoroDocType = new LoroDoc();
    // Mimic an app that stores the rich-text body as a nested container:
    // root > entity > body, binding the editor to `body` rather than the doc
    // root. The parent-walk then climbs past the editor's own subtree.
    const root = doc.getMap("data");
    const entity = root.setContainer("entity", new LoroMap());
    const body = entity.setContainer("body", new LoroMap());
    doc.commit();

    const editorState = editorStateFrom({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      ],
    });
    const mapping: LoroNodeMapping = new Map();
    updateLoroToPmState(doc, mapping, editorState, body.id);

    // Build a cursor 3 chars into the text ("Hel|lo").
    const bodyChildren = body.get(CHILDREN_KEY) as never as {
      get(i: number): unknown;
    };
    const paragraph = bodyChildren.get(0) as LoroMap;
    const paragraphChildren = paragraph.get(CHILDREN_KEY) as never as {
      get(i: number): { getCursor(pos: number): never };
    };
    const text = paragraphChildren.get(0);
    const cursor = text.getCursor(3);

    // Before the fix this threw `Error: Unreachable code`, because the walk
    // assumed it would always terminate at a parentless root container.
    const [pos] = cursorToAbsolutePosition(cursor, doc, mapping);
    expect(pos).toBe(4); // paragraph opens at 0, "Hel|" -> absolute pos 4
  });
});
