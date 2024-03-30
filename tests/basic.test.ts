import { describe, assert, expect, test } from "vitest";

import { Node, Schema, NodeSpec, MarkSpec } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Loro, LoroText } from "loro-crdt";

import { LoroNodeMapping, createNodeFromLoroObj, updateDoc } from "../src";

import { schema } from "./schema";

const examplePmContent = {
  doc: {
    type: "doc",
    content: [
      {
        type: "noteTitle",
        attrs: { emoji: "🦜" },
        content: [{ type: "text", text: "Test note" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "First paragraph" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Second paragraph " },
          { type: "text", marks: [{ type: "bold" }], text: "with bold" },
          { type: "text", text: " text" },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Bullet 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Bullet 2 " },
                  {
                    type: "text",
                    marks: [{ type: "bold" }],
                    text: "with bold",
                  },
                  { type: "text", text: " text" },
                ],
              },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Sub Bullet" }],
                      },
                      {
                        type: "bulletList",
                        content: [
                          {
                            type: "listItem",
                            content: [
                              {
                                type: "paragraph",
                                content: [
                                  { type: "text", text: "Inner bulllet" },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  selection: {
    anchor: 1,
    head: 1,
    type: "text",
  },
};

const exampleLoroContent = {
  doc: {
    nodeName: "doc",
    attributes: {},
    children: [
      {
        nodeName: "noteTitle",
        attributes: { emoji: "🦜" },
        children: ["Test note"],
      },
      { nodeName: "paragraph", attributes: {}, children: ["First paragraph"] },
      {
        nodeName: "paragraph",
        attributes: {},
        children: ["Second paragraph with bold text"],
      },
      {
        nodeName: "bulletList",
        attributes: {},
        children: [
          {
            nodeName: "listItem",
            attributes: {},
            children: [
              { nodeName: "paragraph", attributes: {}, children: ["Bullet 1"] },
            ],
          },
          {
            nodeName: "listItem",
            attributes: {},
            children: [
              {
                nodeName: "paragraph",
                attributes: {},
                children: ["Bullet 2 with bold text"],
              },
              {
                nodeName: "bulletList",
                attributes: {},
                children: [
                  {
                    nodeName: "listItem",
                    attributes: {},
                    children: [
                      {
                        nodeName: "paragraph",
                        attributes: {},
                        children: ["Sub Bullet"],
                      },
                      {
                        nodeName: "bulletList",
                        attributes: {},
                        children: [
                          {
                            nodeName: "listItem",
                            attributes: {},
                            children: [
                              {
                                nodeName: "paragraph",
                                attributes: {},
                                children: ["Inner bulllet"],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("updateDoc", () => {
  test("empty doc gets populated correctly", () => {
    const doc = schema.nodeFromJSON(examplePmContent.doc);
    const editorState = EditorState.create({
      doc,
      schema,
    });
    const loroDoc = new Loro();
    const mapping: LoroNodeMapping = {
      nodes: new Map(),
      parents: new Map(),
    };
    updateDoc(loroDoc, mapping, editorState, editorState);
    expect(loroDoc.toJson()).toEqual(exampleLoroContent);
  });
});

describe("createNodeFromLoroObj", () => {
  test("empty doc gets populated correctly", () => {
    // FIXME: Reusing the logic here to populate the loro doc as its
    // json representation doesn't contain text marks
    const doc = schema.nodeFromJSON(examplePmContent.doc);
    const _editorState = EditorState.create({
      doc,
      schema,
    });
    const loroDoc = new Loro();
    const mapping: LoroNodeMapping = {
      nodes: new Map(),
      parents: new Map(),
    };
    updateDoc(loroDoc, mapping, _editorState, _editorState);

    const node = createNodeFromLoroObj(schema, loroDoc.getMap("doc"), mapping);
    const editorState = EditorState.create({
      doc,
      schema,
    });
    expect(editorState.toJSON()).toEqual(examplePmContent);
  });
});
