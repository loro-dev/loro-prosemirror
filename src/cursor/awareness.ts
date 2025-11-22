import { Awareness, Cursor, type PeerID } from "loro-crdt";
import { createCursorPlugin, type CursorPluginOptions, type CursorPresenceStore } from "./common";
import { PluginKey } from "prosemirror-state";

export class CursorAwareness extends Awareness<{
  anchor: Uint8Array | null;
  focus: Uint8Array | null;
  user: { name: string; color: string } | null;
}> {
  constructor(peer: PeerID, timeout: number = 30_000) {
    super(peer, timeout);
  }

  getAll(): { [peer in PeerID]: { anchor?: Cursor; focus?: Cursor } } {
    const ans: {
      [peer in PeerID]: {
        anchor?: Cursor;
        focus?: Cursor;
        user?: { name: string; color: string };
      };
    } = {};
    for (const [peer, state] of Object.entries(this.getAllStates())) {
      ans[peer as PeerID] = {
        anchor: state.anchor ? Cursor.decode(state.anchor) : undefined,
        focus: state.focus ? Cursor.decode(state.focus) : undefined,
        user: state.user ? state.user : undefined,
      };
    }
    return ans;
  }

  setLocal(state: {
    anchor?: Cursor;
    focus?: Cursor;
    user?: { name: string; color: string };
  }) {
    this.setLocalState({
      anchor: state.anchor?.encode() || null,
      focus: state.focus?.encode() || null,
      user: state.user || null,
    });
  }

  getLocal() {
    const state = this.getLocalState();
    if (!state) {
      return undefined;
    }

    return {
      anchor: state.anchor && Cursor.decode(state.anchor),
      focus: state.focus && Cursor.decode(state.focus),
      user: state.user,
    };
  }
}

export function cursorEq(a?: Cursor | null, b?: Cursor | null) {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  const aPos = a.pos();
  const bPos = b.pos();
  return (
    aPos?.peer === bPos?.peer &&
    aPos?.counter === bPos?.counter &&
    a.containerId() === b.containerId()
  );
}

const loroCursorPluginKey = new PluginKey<{ presenceUpdated: boolean }>(
  "loro-cursor",
);

const awarenessAdapter = (
  awareness: CursorAwareness,
): CursorPresenceStore => ({
  getAll: () => awareness.getAll(),
  getLocal: () => {
    const state = awareness.getLocal();
    if (!state) {
      return undefined;
    }

    return {
      anchor: state.anchor ?? undefined,
      focus: state.focus ?? undefined,
      user: state.user ?? undefined,
    };
  },
  setLocal: (state) => awareness.setLocal(state),
  subscribe: (listener) => {
    const awarenessListener = (_: unknown, origin: string) =>
      listener(origin === "local" ? "local" : "import");
    awareness.addListener(awarenessListener);
    return () => awareness.removeListener(awarenessListener);
  },
});

export const LoroCursorPlugin = (
  awareness: CursorAwareness,
  options: CursorPluginOptions,
) =>
  createCursorPlugin(
    loroCursorPluginKey,
    awarenessAdapter(awareness),
    options,
  );