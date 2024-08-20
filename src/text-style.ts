import type { Schema } from "prosemirror-model";
import mapValues from "just-map-values";
import type { Loro } from "loro-crdt";

const LORO_TEXT_STYLE_CACHE = new WeakSet<Loro>();

function getLoroTextStyle(schema: Schema): {
  [mark: string]: { expand: "before" | "after" | "none" | "both" };
} {
  return mapValues(schema.marks, (mark) => {
    return { expand: mark.spec.inclusive ? "after" : "none" };
  });
}

export function configLoroTextStyle(doc: Loro, schema: Schema) {
  // Avoid reconfiguring the text style for the same Loro document.
  if (LORO_TEXT_STYLE_CACHE.has(doc)) {
    return;
  }
  LORO_TEXT_STYLE_CACHE.add(doc);

  doc.configTextStyle(getLoroTextStyle(schema));
}
