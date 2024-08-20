import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";

const nodes: { [key: string]: NodeSpec } = {
  doc: {
    content: "block*",
  },
  noteTitle: {
    attrs: { emoji: { default: "" } },
    content: "text*",
    group: "block",
  },
  paragraph: {
    content: "inline*",
    group: "block",
  },
  bulletList: {
    content: "listItem+",
    group: "block",
  },
  listItem: {
    content: "paragraph block*",
  },
  text: {
    group: "inline",
  },
};

const marks: { [key: string]: MarkSpec } = {
  bold: {},
  italic: {},
};

export const schema = new Schema({ nodes, marks });
