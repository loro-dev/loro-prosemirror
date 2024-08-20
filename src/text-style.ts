import type { Loro } from "loro-crdt";
import type { Schema } from "prosemirror-model";

const LORO_TEXT_STYLE_CACHE = new WeakSet<Loro>();

function getLoroTextStyle(schema: Schema): {
  [mark: string]: { expand: "before" | "after" | "none" | "both" };
} {
  return Object.fromEntries(
    Object.entries(schema.marks).map(([markName, markType]) => [
      markName,
      { expand: markType.spec.inclusive ? "after" : "none" },
    ])
  );
}

export function configLoroTextStyle(doc: Loro, schema: Schema) {
  // Avoid reconfiguring the text style for the same Loro document.
  if (LORO_TEXT_STYLE_CACHE.has(doc)) {
    return;
  }
  LORO_TEXT_STYLE_CACHE.add(doc);

  doc.configTextStyle(getLoroTextStyle(schema));
}
