import { simpleDiff } from 'lib0/diff'
import { equalityDeep } from 'lib0/function'
import {
  isContainer,
  LoroDoc,
  LoroList,
  LoroMap,
  LoroText,
  LoroTree,
  type ContainerID,
  type Delta,
  type LoroEventBatch,
  type Value,
} from 'loro-crdt'
import { Mark, Node, Schema, type Attrs } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'

type LoroChildrenListType = LoroList<LoroMap<LoroNodeContainerType> | LoroText>
export type LoroNodeContainerType = {
  [CHILDREN_KEY]: LoroChildrenListType
  [ATTRIBUTES_KEY]: LoroMap
  [NODE_NAME_KEY]: string
}

export type LoroDocType = LoroDoc<{
  doc: LoroMap<LoroNodeContainerType>
  data: LoroMap
}>
export type LoroNode = LoroMap<LoroNodeContainerType>
export type LoroContainer =
  | LoroChildrenListType
  | LoroMap<LoroNodeContainerType>
  | LoroText
  | LoroTree
export type LoroType = LoroContainer | Value

// Mapping from a Loro Container ID to a ProseMirror non-text node
// or to the children of a ProseMirror text node.
//
// - For an non-text, it will be a LoroMap mapping to a Node
// - For a text, it will be a LoroText mapping to several Nodes.
//   (PM stores rich text as arrays of text nodes, each one with its marks,
//   and that's why we have some conversion utilities between both)
//
// So ContainerID should always be of a LoroMap or a LoroText.
// Anything else is considered an error.
//
// A PM non-text node, it has attributes and children, which represents as a
// LoroMap with a `"attributes": LoroMap` and a `"children": LoroList` inside
// of it. Both that attributes and children are just part of the parent LoroMap
// structure, which is mapped to an actual node.
//
// See also: https://prosemirror.net/docs/guide/#doc.data_structures
export type LoroNodeMapping = Map<ContainerID, Node | Node[]>

export const ROOT_DOC_KEY = 'doc'
export const ATTRIBUTES_KEY = 'attributes'
export const CHILDREN_KEY = 'children'
export const NODE_NAME_KEY = 'nodeName'
/**
 * Maps PM non-text nodes to their corresponding Loro Container IDs.
 */
export const WEAK_NODE_TO_LORO_CONTAINER_MAPPING = new WeakMap<
  Node,
  ContainerID
>()

export function updateLoroToPmState(
  doc: LoroDocType,
  mapping: LoroNodeMapping,
  editorState: EditorState,
  containerId?: ContainerID,
) {
  const node = editorState.doc
  const map = containerId
    ? (doc.getContainerById(containerId) as LoroMap<LoroNodeContainerType>)
    : doc.getMap(ROOT_DOC_KEY)

  let isInit = false
  if (!map.get('nodeName')) {
    doc.commit()
    isInit = true
    map.set('nodeName', node.type.name)
  }

  updateLoroMap(map, node, mapping)
  if (isInit) {
    doc.commit({ origin: 'sys', message: 'init' })
  } else {
    doc.commit({ origin: 'loroSyncPlugin' })
  }
}

export function createNodeFromLoroObj(
  schema: Schema,
  obj: LoroNode,
  mapping: LoroNodeMapping,
): Node
export function createNodeFromLoroObj(
  schema: Schema,
  obj: LoroText,
  mapping: LoroNodeMapping,
): Node[]
export function createNodeFromLoroObj(
  schema: Schema,
  obj: LoroNode | LoroText,
  mapping: LoroNodeMapping,
): Node | Node[] | null {
  let retval: Node | Node[] | null = mapping.get(obj.id) ?? null
  if (retval != null) {
    return retval
  }

  if (obj instanceof LoroMap) {
    const attributes = getLoroMapAttributes(obj)
    const children = getLoroMapChildren(obj)

    const nodeName = obj.get('nodeName')
    if (nodeName == null || typeof nodeName !== 'string') {
      throw new Error('Invalid nodeName')
    }

    const mappedChildren = children
      .toArray()
      .flatMap((child) => createNodeFromLoroObj(schema, child as any, mapping))
      .filter((n) => n !== null)

    try {
      retval = schema.node(nodeName, attributes.toJSON(), mappedChildren)
      WEAK_NODE_TO_LORO_CONTAINER_MAPPING.set(retval, obj.id)
    } catch (e) {
      // An error occurred while creating the node.
      // This is probably a result of a concurrent action.
      console.error(e)
    }
  } else if (obj instanceof LoroText) {
    retval = []
    for (const [i, delta] of obj.toDelta().entries()) {
      if (delta.insert == null) {
        continue
      }

      try {
        const marks = []
        for (const [markName, mark] of Object.entries(delta.attributes ?? {})) {
          marks.push(schema.mark(markName, mark))
        }
        retval.push(schema.text(delta.insert, marks))
      } catch (e) {
        // An error occurred while creating the node.
        // This is probably a result of a concurrent action.
        console.error(e)
      }
    }
  } else {
    /* v8 ignore next */
    throw new Error('Invalid LoroType')
  }

  if (retval != null) {
    if (!Array.isArray(retval)) {
      WEAK_NODE_TO_LORO_CONTAINER_MAPPING.set(retval, obj.id)
    }
    mapping.set(obj.id, retval)
  } else {
    mapping.delete(obj.id)
  }

  return retval
}

export function createLoroChild(
  parentList: LoroChildrenListType,
  pos: number | null,
  nodeOrNodeList: Node | Node[],
  mapping: LoroNodeMapping,
): LoroText | LoroMap {
  return Array.isArray(nodeOrNodeList)
    ? createLoroText(parentList, pos, nodeOrNodeList, mapping)
    : createLoroMap(parentList, pos, nodeOrNodeList, mapping)
}

export function createLoroText(
  parentList: LoroList,
  pos: number | null,
  nodes: Node[],
  mapping: LoroNodeMapping,
): LoroText {
  const obj = parentList
    .insertContainer(pos ?? parentList.length, new LoroText())
    .getAttached()!

  const delta: Delta<string>[] = nodes.map((node) => ({
    insert: node.text!,
    attributes: nodeMarksToAttributes(node.marks),
  }))
  obj.applyDelta(delta)

  mapping.set(obj.id, nodes)
  return obj
}

export function updateLoroText(
  obj: LoroText,
  nodes: Node[],
  mapping: LoroNodeMapping,
) {
  mapping.set(obj.id, nodes)

  let str = obj.toString()
  const attrs: { [key: string]: Attrs | null } = {}
  for (const delta of obj.toDelta()) {
    for (const key of Object.keys(delta.attributes ?? {})) {
      attrs[key] = null
    }
  }

  const content = nodes.map((p) => ({
    insert: p.text!,
    attributes: Object.assign({}, attrs, nodeMarksToAttributes(p.marks)),
  }))
  const { insert, remove, index } = simpleDiff(
    str,
    content.map((c) => c.insert).join(''),
  )
  if (remove > 0) {
    obj.delete(index, remove)
  }
  if (insert.length) {
    obj.insert(index, insert)
  }

  obj.applyDelta(
    content.map((c) => ({ retain: c.insert.length, attributes: c.attributes })),
  )
}

function nodeMarksToAttributes(marks: readonly Mark[]): {
  [key: string]: Attrs
} {
  const pattrs: { [key: string]: Attrs } = {}
  for (const mark of marks) {
    pattrs[mark.type.name] = mark.attrs
  }
  return pattrs
}

function eqLoroTextNodes(obj: LoroText, nodes: Node[]) {
  const delta = obj.toDelta()
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
  )
}

// TODO: extract code about equality into a single file
/**
 * Whether the loro object is equal to the node.
 */
function eqLoroObjNode(obj: LoroType, node: Node | Node[]): boolean {
  if (obj instanceof LoroMap) {
    if (Array.isArray(node) || !eqNodeName(obj, node)) {
      return false
    }

    const loroChildren = getLoroMapChildren(obj)
    const normalizedContent = normalizeNodeContent(node)
    return (
      loroChildren.length === normalizedContent.length &&
      eqAttrs(getLoroMapAttributes(obj).toJSON(), node.attrs) &&
      normalizedContent.every((childNode, i) =>
        eqLoroObjNode(loroChildren.get(i)!, childNode),
      )
    )
  }

  return (
    obj instanceof LoroText && Array.isArray(node) && eqLoroTextNodes(obj, node)
  )
}

function eqAttrs(attrs1: Attrs, attrs2: Attrs) {
  const keys = Object.keys(attrs1).filter((key) => attrs1[key] !== null)
  let eq =
    keys.length ===
    Object.keys(attrs2).filter((key) => attrs2[key] !== null).length
  for (let i = 0; eq && i < keys.length; i++) {
    const key = keys[i]
    const l = attrs1[key]
    const r = attrs2[key]
    eq =
      l === r ||
      (typeof l === 'object' &&
        l !== null &&
        typeof r === 'object' &&
        r !== null &&
        eqAttrs(l, r))
  }
  return eq
}

function eqNodeName(obj: LoroMap, node: Node | Node[]): boolean {
  return !Array.isArray(node) && obj.get('nodeName') === node.type.name
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
  )
}

function normalizeNodeContent(node: Node): (Node | Node[])[] {
  const res: (Node | Node[])[] = []
  let textNodes: Node[] | null = null

  node.content.forEach((node, offset, i) => {
    if (node.isText) {
      if (textNodes == null) {
        textNodes = []
        res.push(textNodes)
      }
      textNodes.push(node)
    } else {
      res.push(node)
      textNodes = null
    }
  })

  return res
}

function computeChildEqualityFactor(
  obj: LoroNode,
  node: Node,
  mapping: LoroNodeMapping,
): {
  factor: number
  foundMappedChild: boolean
} {
  const loroChildren = getLoroMapChildren(obj)
  const loroChildLength = loroChildren.length

  const nodeChildren = normalizeNodeContent(node)
  const nodeChildLength = nodeChildren.length

  const minLength = Math.min(loroChildLength, nodeChildLength)
  let left = 0
  let right = 0

  let foundMappedChild = false
  for (; left < minLength; left++) {
    const leftLoro = loroChildren.get(left)
    const leftNode = nodeChildren[left]
    if (
      eqMappedNode(
        leftLoro != null && isContainer(leftLoro)
          ? mapping.get(leftLoro.id)
          : undefined,
        leftNode,
      )
    ) {
      foundMappedChild = true // good match!
    } else if (
      leftLoro == null ||
      leftNode == null ||
      !eqLoroObjNode(leftLoro, leftNode)
    ) {
      break
    }
  }
  for (; left + right < minLength; right++) {
    const rightLoro = loroChildren.get(loroChildLength - right - 1)
    const rightNode = nodeChildren[nodeChildLength - right - 1]
    if (
      eqMappedNode(
        rightLoro != null && isContainer(rightLoro)
          ? mapping.get(rightLoro.id)
          : undefined,
        rightNode,
      )
    ) {
      foundMappedChild = true // good match!
    } else if (
      rightLoro == null ||
      rightNode == null ||
      !eqLoroObjNode(rightLoro, rightNode)
    ) {
      break
    }
  }
  return {
    factor: left + right,
    foundMappedChild,
  }
}

export function createLoroMap(
  parentList: LoroChildrenListType,
  pos: number | null,
  node: Node,
  mapping: LoroNodeMapping,
): LoroMap {
  const obj = parentList
    .insertContainer(pos ?? parentList.length, new LoroMap())
    .getAttached()! as LoroNode

  obj.set('nodeName', node.type.name)

  const attrs = getLoroMapAttributes(obj)
  for (const [key, value] of Object.entries(node.attrs)) {
    if (value !== null) {
      attrs.set(key, value)
    }
  }

  const children = getLoroMapChildren(obj)
  normalizeNodeContent(node).forEach((child, i) =>
    createLoroChild(children, null, child, mapping),
  )

  WEAK_NODE_TO_LORO_CONTAINER_MAPPING.set(node, obj.id)
  mapping.set(obj.id, node)
  return obj
}

export function updateLoroMap(
  obj: LoroNode,
  node: Node,
  mapping: LoroNodeMapping,
) {
  mapping.set(obj.id, node)
  WEAK_NODE_TO_LORO_CONTAINER_MAPPING.set(node, obj.id)

  if (!eqNodeName(obj, node)) {
    throw new Error('node name mismatch!')
  }

  updateLoroMapAttributes(obj, node, mapping)
  updateLoroMapChildren(obj, node, mapping)
}

export function getLoroMapAttributes(
  obj: LoroMap,
): LoroMap<{ [key: string]: string }> {
  return obj.getOrCreateContainer(ATTRIBUTES_KEY, new LoroMap())
}

export function updateLoroMapAttributes(
  obj: LoroMap,
  node: Node,
  mapping: LoroNodeMapping,
): void {
  const attrs = getLoroMapAttributes(obj)
  const keys = new Set(attrs.keys())

  const pAttrs = node.attrs
  for (const [key, value] of Object.entries(pAttrs)) {
    if (value !== null) {
      if (!equalityDeep(attrs.get(key), value)) {
        attrs.set(key, value)
      }
    } else {
      attrs.delete(key)
    }
    keys.delete(key)
  }

  // remove all keys that are no longer in pAttrs
  for (const key of keys) {
    pAttrs.delete(key)
  }
}

export function getLoroMapChildren(obj: LoroNode): LoroChildrenListType {
  return obj.getOrCreateContainer(CHILDREN_KEY, new LoroList())
}

export function updateLoroMapChildren(
  obj: LoroNode,
  node: Node,
  mapping: LoroNodeMapping,
): void {
  const loroChildren = getLoroMapChildren(obj)
  const loroChildLength = loroChildren.length

  const nodeChildren = normalizeNodeContent(node)
  const nodeChildLength = nodeChildren.length

  const minLength = Math.min(nodeChildLength, loroChildLength)
  let left = 0
  let right = 0

  // find number of matching elements from left
  for (; left < minLength; left++) {
    const leftLoro = loroChildren.get(left)
    const leftNode = nodeChildren[left]
    if (
      leftLoro == null ||
      leftNode == null ||
      (isContainer(leftLoro) &&
        !eqMappedNode(mapping.get(leftLoro.id), leftNode))
    ) {
      if (
        leftLoro != null &&
        leftNode != null &&
        isContainer(leftLoro) &&
        eqLoroObjNode(leftLoro, leftNode)
      ) {
        // If they actually equal but have different pointers, update the mapping
        // update mapping
        WEAK_NODE_TO_LORO_CONTAINER_MAPPING.set(leftNode as Node, leftLoro.id)
        mapping.set(leftLoro.id, leftNode)
      } else {
        break
      }
    }
  }

  // find number of matching elements from right
  for (; right + left < minLength; right++) {
    const rightLoro = loroChildren.get(loroChildLength - right - 1)
    const rightNode = nodeChildren[nodeChildLength - right - 1]
    if (
      rightLoro == null ||
      rightNode == null ||
      (isContainer(rightLoro) &&
        !eqMappedNode(mapping.get(rightLoro.id), rightNode))
    ) {
      if (
        rightLoro != null &&
        rightNode != null &&
        isContainer(rightLoro) &&
        eqLoroObjNode(rightLoro, rightNode)
      ) {
        // If they actually equal but have different pointers, update the mapping
        // update mapping
        WEAK_NODE_TO_LORO_CONTAINER_MAPPING.set(rightNode as Node, rightLoro.id)
        mapping.set(rightLoro.id, rightNode)
      } else {
        break
      }
    }
  }

  // try to compare and update
  while (
    loroChildLength - left - right > 0 &&
    nodeChildLength - left - right > 0
  ) {
    const leftLoro = loroChildren.get(left)
    const leftNode = nodeChildren[left]
    const rightLoro = loroChildren.get(loroChildLength - right - 1)
    const rightNode = nodeChildren[nodeChildLength - right - 1]

    if (leftLoro instanceof LoroText && Array.isArray(leftNode)) {
      if (!eqLoroTextNodes(leftLoro, leftNode)) {
        updateLoroText(leftLoro, leftNode, mapping)
      }
      left += 1
    } else {
      let updateLeft =
        leftLoro instanceof LoroMap && eqNodeName(leftLoro, leftNode)
      let updateRight =
        rightLoro instanceof LoroMap && eqNodeName(rightLoro, rightNode)

      if (updateLeft && updateRight) {
        // decide which which element to update
        const leftEquality = computeChildEqualityFactor(
          leftLoro as LoroNode,
          leftNode as Node,
          mapping,
        )
        const rightEquality = computeChildEqualityFactor(
          rightLoro as LoroNode,
          rightNode as Node,
          mapping,
        )

        if (leftEquality.foundMappedChild && !rightEquality.foundMappedChild) {
          updateRight = false
        } else if (
          rightEquality.foundMappedChild &&
          !leftEquality.foundMappedChild
        ) {
          updateLeft = false
        } else if (leftEquality.factor < rightEquality.factor) {
          updateLeft = false
        } else {
          updateRight = false
        }
      }

      if (updateLeft) {
        updateLoroMap(leftLoro as LoroNode, leftNode as Node, mapping)
        left += 1
      } else if (updateRight) {
        updateLoroMap(rightLoro as LoroNode, rightNode as Node, mapping)
        right += 1
      } else {
        // recreate the element at left
        const child = loroChildren.get(left)
        if (isContainer(child)) {
          mapping.delete(child.id)
        }
        loroChildren.delete(left, 1)
        createLoroChild(loroChildren, left, leftNode, mapping)
        left += 1
      }
    }
  }

  const loroDelLength = loroChildLength - left - right
  if (
    loroChildLength === 1 &&
    nodeChildLength === 0 &&
    loroChildren.get(0) instanceof LoroText
  ) {
    // Only delete the content of the LoroText to retain remote changes on the same LoroText object
    // Otherwise, the LoroText object will be deleted and all the concurrent edits to the same LoroText object will be lost
    const loroText = loroChildren.get(0) as LoroText
    mapping.delete(loroText.id)
    loroText.delete(0, loroText.length)
  } else if (loroDelLength > 0) {
    loroChildren
      .toArray()
      .slice(left, left + loroDelLength)
      .filter(isContainer)
      .forEach((type) => mapping.delete((type as LoroContainer).id))
    loroChildren.delete(left, loroDelLength)
  }

  if (left + right < nodeChildLength) {
    nodeChildren
      .slice(left, nodeChildLength - right)
      .forEach((nodeChild, i) =>
        createLoroChild(loroChildren, left + i, nodeChild, mapping),
      )
  }
}

export function clearChangedNodes(
  doc: LoroDocType,
  event: LoroEventBatch,
  mapping: LoroNodeMapping,
) {
  for (const e of event.events) {
    const obj = doc.getContainerById(e.target)
    mapping.delete(obj.id)

    let parentObj = obj.parent()
    while (!!parentObj) {
      mapping.delete(parentObj!.id)
      parentObj = parentObj!.parent()
    }
  }
}
