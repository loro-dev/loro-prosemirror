import { simpleDiff } from "lib0/diff";
import {
  Delta,
  Loro,
  LoroEventBatch,
  LoroList,
  LoroMap,
  LoroText,
  LoroTree,
  Value,
} from "loro-crdt";
import { EditorState } from "prosemirror-state";
import { Attrs, Mark, Node, Schema } from "prosemirror-model";

export type LoroContainer =
  | LoroList<LoroType[]>
  | LoroMap<{ [key: string]: LoroType }>
  | LoroText
  | LoroTree;
export type LoroType = LoroContainer | Value;
export type LoroNodeMapping = Map<LoroType, Node | Node[]>;

export const ROOT_DOC_KEY = "doc";
export const ATTRIBUTES_KEY = "attributes";
export const CHILDREN_KEY = "children";

export function updateDoc(
  doc: Loro,
  mapping: LoroNodeMapping,
  oldEditorState: EditorState,
  newEditorState: EditorState,
) {
  const node = newEditorState.doc;
  const map = doc.getMap(ROOT_DOC_KEY);

  if (map.get("nodeName") == null) {
    map.set("nodeName", node.type.name);
  }

  updateLoroMap(map, node, mapping);
  doc.commit("loroSyncPlugin");
}

export function createNodeFromLoroObj(
  schema: Schema,
  obj: LoroMap,
  mapping: LoroNodeMapping,
): Node;
export function createNodeFromLoroObj(
  schema: Schema,
  obj: LoroText,
  mapping: LoroNodeMapping,
): Node[];
export function createNodeFromLoroObj(
  schema: Schema,
  obj: LoroMap | LoroText,
  mapping: LoroNodeMapping,
): Node | Node[] | null {
  let retval: Node | Node[] | null = mapping.get(obj) ?? null;
  if (retval != null) {
    return retval;
  }

  if (obj instanceof LoroMap) {
    const attributes = getLoroMapAttributes(obj);
    const children = getLoroMapChildren(obj);

    const nodeName = obj.get("nodeName");
    if (nodeName == null || typeof nodeName !== "string") {
      throw new Error("Invalid nodeName");
    }

    const mappedChildren = children
      .toArray()
      .flatMap((child) => createNodeFromLoroObj(schema, child as any, mapping))
      .filter((n) => n !== null);

    try {
      retval = schema.node(nodeName, attributes.toJson(), mappedChildren);
    } catch (e) {
      // An error occured while creating the node.
      // This is probably a result of a concurrent action.
      console.error(e);
    }
  } else if (obj instanceof LoroText) {
    retval = [];
    for (const [i, delta] of obj.toDelta().entries()) {
      if (delta.insert == null) {
        continue;
      }

      try {
        const marks = [];
        for (const [markName, mark] of Object.entries(delta.attributes ?? {})) {
          marks.push(schema.mark(markName, mark));
        }
        retval.push(schema.text(delta.insert, marks));
      } catch (e) {
        // An error occured while creating the node.
        // This is probably a result of a concurrent action.
        console.error(e);
      }
    }
  } else {
    /* v8 ignore next */
    throw new Error("Invalid LoroType");
  }

  if (retval != null) {
    mapping.set(obj, retval);
  } else {
    mapping.delete(obj);
  }

  return retval;
}

export function createLoroChild(
  parentList: LoroList,
  pos: number | null,
  nodeOrNodeList: Node | Node[],
  mapping: LoroNodeMapping,
): LoroText | LoroMap {
  return Array.isArray(nodeOrNodeList)
    ? createLoroText(parentList, pos, nodeOrNodeList, mapping)
    : createLoroMap(parentList, pos, nodeOrNodeList, mapping);
}

export function createLoroText(
  parentList: LoroList,
  pos: number | null,
  nodes: Node[],
  mapping: LoroNodeMapping,
): LoroText {
  const obj = parentList
    .insertContainer(pos ?? parentList.length, new LoroText())
    .getAttached()!;

  const delta: Delta<string>[] = nodes.map((node) => ({
    insert: node.text!,
    attributes: nodeMarksToAttributes(node.marks),
  }));
  obj.applyDelta(delta);

  mapping.set(obj, nodes);
  return obj;
}

export function updateLoroText(
  obj: LoroText,
  nodes: Node[],
  mapping: LoroNodeMapping,
) {
  mapping.set(obj, nodes);

  let str = obj.toString();
  const attrs: { [key: string]: Attrs | null } = {};
  for (const delta of obj.toDelta()) {
    for (const key of Object.keys(delta.attributes ?? {})) {
      attrs[key] = null;
    }
  }

  const content = nodes.map((p) => ({
    insert: p.text!,
    attributes: Object.assign({}, attrs, nodeMarksToAttributes(p.marks)),
  }));
  const { insert, remove, index } = simpleDiff(
    str,
    content.map((c) => c.insert).join(""),
  );
  if (remove > 0) {
    obj.delete(index, remove);
  }
  if (insert.length) {
    obj.insert(index, insert);
  }

  obj.applyDelta(
    content.map((c) => ({ retain: c.insert.length, attributes: c.attributes })),
  );
}

function nodeMarksToAttributes(marks: readonly Mark[]): {
  [key: string]: Attrs;
} {
  const pattrs: { [key: string]: Attrs } = {};
  for (const mark of marks) {
    pattrs[mark.type.name] = mark.attrs;
  }
  return pattrs;
}

function eqLoroTextNodes(obj: LoroText, nodes: Node[]) {
  const delta = obj.toDelta();
  return (
    delta.length === nodes.length &&
    delta.every(
      (delta, i) =>
        delta.insert === nodes[i].text &&
        Object.keys(delta.attributes || {}).length === nodes[i].marks.length &&
        nodes[i].marks.every((mark) =>
          eqAttrs((delta.attributes || {})[mark.type.name], mark.attrs),
        ),
    )
  );
}

function eqLoroObjNode(
  obj: LoroType,
  node: Node | Node[],
  mapping: LoroNodeMapping,
): boolean {
  if (obj instanceof LoroMap) {
    if (Array.isArray(node) || !eqNodeName(obj, node)) {
      return false;
    }

    const loroChildren = getLoroMapChildren(obj);
    const normalizedContent = normalizeNodeContent(node);
    return (
      loroChildren.length === normalizedContent.length &&
      eqAttrs(getLoroMapAttributes(obj).toJson(), node.attrs) &&
      normalizedContent.every((childNode, i) =>
        eqLoroObjNode(loroChildren.get(i)!, childNode, mapping),
      )
    );
  }

  return (
    obj instanceof LoroText && Array.isArray(node) && eqLoroTextNodes(obj, node)
  );
}

function eqAttrs(attrs1: Attrs, attrs2: Attrs) {
  const keys = Object.keys(attrs1).filter((key) => attrs1[key] !== null);
  let eq =
    keys.length ===
    Object.keys(attrs2).filter((key) => attrs2[key] !== null).length;
  for (let i = 0; eq && i < keys.length; i++) {
    const key = keys[i];
    const l = attrs1[key];
    const r = attrs2[key];
    eq =
      l === r ||
      (typeof l === "object" &&
        l !== null &&
        typeof r === "object" &&
        r !== null &&
        eqAttrs(l, r));
  }
  return eq;
}

function eqNodeName(obj: LoroMap, node: Node | Node[]): boolean {
  return !Array.isArray(node) && obj.get("nodeName") === node.type.name;
}

function eqMappedNode(
  mapped: Node | Node[] | undefined,
  node: Node | Node[] | undefined,
) {
  return (
    mapped === node ||
    (Array.isArray(mapped) &&
      Array.isArray(node) &&
      mapped.length === node.length &&
      mapped.every((a, i) => node[i].eq(a)))
  );
}

function normalizeNodeContent(node: Node): (Node | Node[])[] {
  const res: (Node | Node[])[] = [];
  let textNodes: Node[] | null = null;

  node.content.forEach((node, offset, i) => {
    if (node.isText) {
      if (textNodes == null) {
        textNodes = [];
        res.push(textNodes);
      }
      textNodes.push(node);
    } else {
      res.push(node);
      textNodes = null;
    }
  });

  return res;
}

function computeChildEqualityFactor(
  obj: LoroMap,
  node: Node,
  mapping: LoroNodeMapping,
): {
  factor: number;
  foundMappedChild: boolean;
} {
  const loroChildren = getLoroMapChildren(obj);
  const loroChildLength = loroChildren.length;

  const nodeChildren = normalizeNodeContent(node);
  const nodeChildLength = nodeChildren.length;

  const minLength = Math.min(loroChildLength, nodeChildLength);
  let left = 0;
  let right = 0;

  let foundMappedChild = false;
  for (; left < minLength; left++) {
    const leftLoro = loroChildren.get(left);
    const leftNode = nodeChildren[left];
    if (
      eqMappedNode(
        leftLoro != null ? mapping.get(leftLoro) : undefined,
        leftNode,
      )
    ) {
      foundMappedChild = true; // good match!
    } else if (
      leftLoro == null ||
      leftNode == null ||
      !eqLoroObjNode(leftLoro, leftNode, mapping)
    ) {
      break;
    }
  }
  for (; left + right < minLength; right++) {
    const rightLoro = loroChildren.get(loroChildLength - right - 1);
    const rightNode = nodeChildren[nodeChildLength - right - 1];
    if (
      eqMappedNode(
        rightLoro != null ? mapping.get(rightLoro) : undefined,
        rightNode,
      )
    ) {
      foundMappedChild = true; // good match!
    } else if (
      rightLoro == null ||
      rightNode == null ||
      !eqLoroObjNode(rightLoro, rightNode, mapping)
    ) {
      break;
    }
  }
  return {
    factor: left + right,
    foundMappedChild,
  };
}

export function createLoroMap(
  parentList: LoroList,
  pos: number | null,
  node: Node,
  mapping: LoroNodeMapping,
): LoroMap {
  const obj = parentList
    .insertContainer(pos ?? parentList.length, new LoroMap())
    .getAttached()!;

  obj.set("nodeName", node.type.name);

  const attrs = getLoroMapAttributes(obj);
  for (const [key, value] of Object.entries(node.attrs)) {
    if (value !== null) {
      attrs.set(key, value);
    }
  }

  const children = getLoroMapChildren(obj);
  normalizeNodeContent(node).forEach((child, i) =>
    createLoroChild(children, null, child, mapping),
  );

  mapping.set(obj, node);
  return obj;
}

export function updateLoroMap(
  obj: LoroMap,
  node: Node,
  mapping: LoroNodeMapping,
) {
  mapping.set(obj, node);

  if (!eqNodeName(obj, node)) {
    throw new Error("node name mismatch!");
  }

  updateLoroMapAttributes(obj, node, mapping);
  updateLoroMapChildren(obj, node, mapping);
}

export function getLoroMapAttributes(
  obj: LoroMap,
): LoroMap<{ [key: string]: string }> {
  return obj.getOrCreateContainer(ATTRIBUTES_KEY, new LoroMap());
}

export function updateLoroMapAttributes(
  obj: LoroMap,
  node: Node,
  mapping: LoroNodeMapping,
): void {
  const attrs = getLoroMapAttributes(obj);
  const keys = new Set(attrs.keys());

  const pAttrs = node.attrs;
  for (const [key, value] of Object.entries(node.attrs)) {
    if (value !== null) {
      // TODO: Will calling `set` without `get` generate diffs if the content is the same?
      if (attrs.get(key) !== value) {
        attrs.set(key, value);
      }
    } else {
      // TODO: Can we just call delete without checking this here?
      if (keys.has(key)) {
        attrs.delete(key);
      }
    }
    keys.delete(key);
  }

  // remove all keys that are no longer in pAttrs
  for (const key of keys) {
    attrs.delete(key);
  }
}

export function getLoroMapChildren(obj: LoroMap): LoroList<LoroType[]> {
  return obj.getOrCreateContainer(CHILDREN_KEY, new LoroList());
}

export function updateLoroMapChildren(
  obj: LoroMap,
  node: Node,
  mapping: LoroNodeMapping,
): void {
  const loroChildren = getLoroMapChildren(obj);
  const loroChildLength = loroChildren.length;

  const nodeChildren = normalizeNodeContent(node);
  const nodeChildLength = nodeChildren.length;

  const minLength = Math.min(nodeChildLength, loroChildLength);
  let left = 0;
  let right = 0;

  // find number of matching elements from left
  for (; left < minLength; left++) {
    const leftLoro = loroChildren.get(left);
    const leftNode = nodeChildren[left];
    if (
      leftLoro == null ||
      leftNode == null ||
      !eqMappedNode(mapping.get(leftLoro), leftNode)
    ) {
      if (
        leftLoro != null &&
        leftNode != null &&
        eqLoroObjNode(leftLoro, leftNode, mapping)
      ) {
        // update mapping
        mapping.set(leftLoro, leftNode);
      } else {
        break;
      }
    }
  }

  // find number of matching elements from right
  for (; right + left < minLength; right++) {
    const rightLoro = loroChildren.get(loroChildLength - right - 1);
    const rightNode = nodeChildren[nodeChildLength - right - 1];
    if (
      rightLoro == null ||
      rightNode == null ||
      !eqMappedNode(mapping.get(rightLoro), rightNode)
    ) {
      if (
        rightLoro != null &&
        rightNode != null &&
        eqLoroObjNode(rightLoro, rightNode, mapping)
      ) {
        // update mapping
        mapping.set(rightLoro, rightNode);
      } else {
        break;
      }
    }
  }

  // try to compare and update
  while (
    loroChildLength - left - right > 0 &&
    nodeChildLength - left - right > 0
  ) {
    const leftLoro = loroChildren.get(left);
    const leftNode = nodeChildren[left];
    const rightLoro = loroChildren.get(loroChildLength - right - 1);
    const rightNode = nodeChildren[nodeChildLength - right - 1];

    if (leftLoro instanceof LoroText && Array.isArray(leftNode)) {
      if (!eqLoroTextNodes(leftLoro, leftNode)) {
        updateLoroText(leftLoro, leftNode, mapping);
      }
      left += 1;
    } else {
      let updateLeft =
        leftLoro instanceof LoroMap && eqNodeName(leftLoro, leftNode);
      let updateRight =
        rightLoro instanceof LoroMap && eqNodeName(rightLoro, rightNode);

      if (updateLeft && updateRight) {
        // decide which which element to update
        const leftEquality = computeChildEqualityFactor(
          leftLoro as LoroMap,
          leftNode as Node,
          mapping,
        );
        const rightEquality = computeChildEqualityFactor(
          rightLoro as LoroMap,
          rightNode as Node,
          mapping,
        );

        if (leftEquality.foundMappedChild && !rightEquality.foundMappedChild) {
          updateRight = false;
        } else if (
          rightEquality.foundMappedChild &&
          !leftEquality.foundMappedChild
        ) {
          updateLeft = false;
        } else if (leftEquality.factor < rightEquality.factor) {
          updateLeft = false;
        } else {
          updateRight = false;
        }
      }

      if (updateLeft) {
        updateLoroMap(leftLoro as LoroMap, leftNode as Node, mapping);
        left += 1;
      } else if (updateRight) {
        updateLoroMap(rightLoro as LoroMap, rightNode as Node, mapping);
        right += 1;
      } else {
        mapping.delete(loroChildren.get(left)!);
        loroChildren.delete(left, 1);
        createLoroChild(loroChildren, left, leftNode, mapping);
        left += 1;
      }
    }
  }

  const loroDelLength = loroChildLength - left - right;
  if (
    loroChildLength === 1 &&
    nodeChildLength === 0 &&
    loroChildren.get(0) instanceof LoroText
  ) {
    // Only delete the content of the LoroText to retain remote changes on the same LoroText object
    const loroText = loroChildren.get(0) as LoroText;
    mapping.delete(loroText);
    loroText.delete(0, loroText.length);
  } else if (loroDelLength > 0) {
    loroChildren
      .toArray()
      .slice(left, left + loroDelLength)
      .forEach((type) => mapping.delete(type));
    loroChildren.delete(left, loroDelLength);
  }

  if (left + right < nodeChildLength) {
    nodeChildren
      .slice(left, left + nodeChildLength - right)
      .forEach((nodeChild, i) =>
        createLoroChild(loroChildren, left + i, nodeChild, mapping),
      );
  }
}

export function clearChangedNodes(
  doc: Loro,
  event: LoroEventBatch,
  mapping: LoroNodeMapping,
) {
  for (const e of event.events) {
    const obj = doc.getContainerById(e.target);
    mapping.delete(obj);

    let parentObj = obj.parent();
    while (parentObj != null) {
      mapping.delete(parentObj);
      parentObj = parentObj.parent();
    }
  }
}
