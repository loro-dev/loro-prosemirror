import { describe, expect, test } from "vitest";

import { LoroDoc } from "loro-crdt";

import {
  ROOT_DOC_KEY,
  clearChangedNodes,
  createNodeFromLoroObj,
  getLoroMapChildren,
  updateLoroToPmState,
  type LoroDocType,
  type LoroNodeMapping,
} from "../src/lib";

import { schema } from "./schema";
import {
  createEditorState,
  insertLoroMap,
  insertLoroText,
  oneMs,
  setupLoroMap,
} from "./utils";

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
                        content: [
                          {
                            type: "text",
                            text: "Sub Bullet",
                          },
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
                                content: [
                                  {
                                    type: "text",
                                    text: "Inner bulllet",
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
      {
        nodeName: "paragraph",
        attributes: {},
        children: ["First paragraph"],
      },
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
              {
                nodeName: "paragraph",
                attributes: {},
                children: ["Bullet 1"],
              },
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
    const editorState = createEditorState(schema, examplePmContent.doc);
    const loroDoc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();
    updateLoroToPmState(loroDoc, mapping, editorState);
    expect(loroDoc.toJSON()).toEqual(exampleLoroContent);
  });

  test("doc syncs changes correctly", () => {
    const loroDoc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();

    // First we create an empty content
    const pmContent: any = {};
    pmContent["type"] = ROOT_DOC_KEY;
    pmContent["content"] = [];
    let editorState = createEditorState(schema, pmContent);

    updateLoroToPmState(loroDoc, mapping, editorState);
    expect(loroDoc.toJSON()).toEqual({
      [ROOT_DOC_KEY]: {
        nodeName: ROOT_DOC_KEY,
        attributes: {},
        children: [],
      },
    });

    // Now lets add a paragraph
    pmContent.content.push({
      type: "paragraph",
      content: [{ type: "text", text: "Hello world" }],
    });
    editorState = createEditorState(schema, pmContent);

    updateLoroToPmState(loroDoc, mapping, editorState);
    expect(loroDoc.toJSON()).toEqual({
      [ROOT_DOC_KEY]: {
        nodeName: ROOT_DOC_KEY,
        attributes: {},
        children: [
          {
            nodeName: "paragraph",
            attributes: {},
            children: ["Hello world"],
          },
        ],
      },
    });

    // A second paragraph
    pmContent.content.push({
      type: "paragraph",
      content: [{ type: "text", text: "Hello world 2" }],
    });
    editorState = createEditorState(schema, pmContent);

    updateLoroToPmState(loroDoc, mapping, editorState);
    expect(loroDoc.toJSON()).toEqual({
      [ROOT_DOC_KEY]: {
        nodeName: ROOT_DOC_KEY,
        attributes: {},
        children: [
          {
            nodeName: "paragraph",
            attributes: {},
            children: ["Hello world"],
          },
          {
            nodeName: "paragraph",
            attributes: {},
            children: ["Hello world 2"],
          },
        ],
      },
    });

    // A bullet list before the first paragraph
    pmContent.content.unshift({
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
      ],
    });
    editorState = createEditorState(schema, pmContent);

    updateLoroToPmState(loroDoc, mapping, editorState);
    expect(loroDoc.toJSON()).toEqual({
      [ROOT_DOC_KEY]: {
        nodeName: ROOT_DOC_KEY,
        attributes: {},
        children: [
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
                    children: ["Bullet 1"],
                  },
                ],
              },
            ],
          },
          {
            nodeName: "paragraph",
            attributes: {},
            children: ["Hello world"],
          },
          {
            nodeName: "paragraph",
            attributes: {},
            children: ["Hello world 2"],
          },
        ],
      },
    });

    // Now lets delete the first paragraph, add another item to the bullet list
    // and also add some bold text to the second paragraph
    pmContent.content.splice(1, 1);
    pmContent.content[0].content.push({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Bullet 2" }],
        },
      ],
    });
    pmContent.content[1].content.push({
      type: "text",
      marks: [{ type: "bold" }],
      text: " with bold text",
    });
    editorState = createEditorState(schema, pmContent);

    updateLoroToPmState(loroDoc, mapping, editorState);
    expect(loroDoc.toJSON()).toEqual({
      [ROOT_DOC_KEY]: {
        nodeName: ROOT_DOC_KEY,
        attributes: {},
        children: [
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
                    children: ["Bullet 1"],
                  },
                ],
              },
              {
                nodeName: "listItem",
                attributes: {},
                children: [
                  {
                    nodeName: "paragraph",
                    attributes: {},
                    children: ["Bullet 2"],
                  },
                ],
              },
            ],
          },
          {
            nodeName: "paragraph",
            attributes: {},
            children: ["Hello world 2 with bold text"],
          },
        ],
      },
    });
  });
});

describe("createNodeFromLoroObj", () => {
  test("node gets created from doc correctly", () => {
    // FIXME: Reusing the logic here to populate the loro doc as its
    // json representation doesn't contain text marks
    const _editorState = createEditorState(schema, examplePmContent.doc);
    const loroDoc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();
    updateLoroToPmState(loroDoc, mapping, _editorState);

    const editorState = createEditorState(schema, examplePmContent.doc);
    expect(editorState.toJSON()).toEqual(examplePmContent);
  });

  test("node syncs changes correctly", async () => {
    const loroDoc: LoroDocType = new LoroDoc();
    const mapping: LoroNodeMapping = new Map();

    loroDoc.subscribe((event) => clearChangedNodes(loroDoc, event, mapping));

    // First we create an empty content
    const loroInnerDoc = loroDoc.getMap(ROOT_DOC_KEY);
    setupLoroMap(loroInnerDoc, ROOT_DOC_KEY);

    let node = createNodeFromLoroObj(schema, loroInnerDoc, mapping);
    expect(node.toJSON()).toEqual({
      type: "doc",
    });

    // Now lets add a paragraph
    const p1 = insertLoroMap(getLoroMapChildren(loroInnerDoc), "paragraph");
    const p1Text = insertLoroText(getLoroMapChildren(p1 as any));
    p1Text.insert(0, "Hello world!");

    loroDoc.commit();
    await oneMs();

    node = createNodeFromLoroObj(schema, loroInnerDoc, mapping);
    expect(node.toJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world!" }],
        },
      ],
    });

    // Lets make "world" bold
    p1Text.mark({ start: 6, end: 11 }, "bold", true);

    loroDoc.commit();
    await oneMs();

    node = createNodeFromLoroObj(schema, loroInnerDoc, mapping);
    expect(node.toJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "world",
            },
            { type: "text", text: "!" },
          ],
        },
      ],
    });

    // Add a second paragraph
    const p2 = insertLoroMap(getLoroMapChildren(loroInnerDoc), "paragraph");
    const p2Text = insertLoroText(getLoroMapChildren(p2 as any));
    p2Text.insert(0, "Second paragraph");

    loroDoc.commit();
    await oneMs();

    node = createNodeFromLoroObj(schema, loroInnerDoc, mapping);
    expect(node.toJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "world",
            },
            { type: "text", text: "!" },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second paragraph" }],
        },
      ],
    });

    // Now lets add a bullet list
    const bulletList = insertLoroMap(
      getLoroMapChildren(loroInnerDoc),
      "bulletList",
    );
    const bullet1 = insertLoroMap(getLoroMapChildren(bulletList), "listItem");
    const bullet1Paragraph = insertLoroMap(
      getLoroMapChildren(bullet1),
      "paragraph",
    );
    const bullet1Text = insertLoroText(getLoroMapChildren(bullet1Paragraph));
    bullet1Text.insert(0, "Bullet 1");

    const bullet2 = insertLoroMap(getLoroMapChildren(bulletList), "listItem");
    const bullet2Paragraph = insertLoroMap(
      getLoroMapChildren(bullet2),
      "paragraph",
    );
    const bullet2Text = insertLoroText(getLoroMapChildren(bullet2Paragraph));
    bullet2Text.insert(0, "Bullet 2");

    loroDoc.commit();
    await oneMs();

    node = createNodeFromLoroObj(schema, loroInnerDoc, mapping);
    expect(node.toJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "world",
            },
            { type: "text", text: "!" },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second paragraph" }],
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
                  content: [{ type: "text", text: "Bullet 2" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
