import { describe, expect, test } from "vitest";

import { LoroDoc } from "loro-crdt";

import {
  ROOT_DOC_KEY,
  updateLoroToPmState,
  type LoroDocType,
  type LoroNodeMapping,
} from "../src/lib";
import { cursorToAbsolutePosition } from "../src/cursor/common";

import { schema } from "./schema";
import { createEditorState } from "./utils";

describe("cursorToAbsolutePosition", () => {
  test("returns fallback when text container does not exist in the doc", () => {
    // Create docA with a paragraph containing text, and get a cursor from it
    const docA: LoroDocType = new LoroDoc();
    const mappingA: LoroNodeMapping = new Map();
    const editorState = createEditorState(schema, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });
    updateLoroToPmState(docA, mappingA, editorState);

    // Get a cursor pointing to a text container in docA
    const docMap = docA.getMap(ROOT_DOC_KEY);
    const children = docMap.get("children");
    const paragraph = children.get(0);
    const paragraphChildren = paragraph.get("children");
    const loroText = paragraphChildren.get(0);
    const cursor = loroText.getCursor(0)!;

    // Create a separate empty doc — this simulates a peer that hasn't
    // received the container yet
    const docB: LoroDocType = new LoroDoc();
    const mappingB: LoroNodeMapping = new Map();

    // Should return [1, undefined] instead of throwing
    expect(() => {
      cursorToAbsolutePosition(cursor, docB, mappingB);
    }).not.toThrow();

    const result = cursorToAbsolutePosition(cursor, docB, mappingB);
    expect(result).toEqual([1, undefined]);
  });
});
