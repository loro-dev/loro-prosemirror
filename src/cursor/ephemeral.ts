import { Cursor, EphemeralStore, type PeerID } from "loro-crdt";
import { PluginKey } from "prosemirror-state";

import {
  createCursorPlugin,
  type CursorPluginOptions,
  type CursorPresenceState,
  type CursorPresenceStore,
} from "./common";

type CursorEphemeralPayload = {
  anchor: Uint8Array | null;
  focus: Uint8Array | null;
  user: { name: string; color: string } | null;
};

type CursorEphemeralStateMap = Record<string, CursorEphemeralPayload>;

export class CursorEphemeralStore extends EphemeralStore<CursorEphemeralStateMap> {
  private peer: PeerID;

  constructor(peer: PeerID, timeout?: number) {
    super(timeout);
    this.peer = peer;
  }

  setLocal(state: CursorPresenceState) {
    if (!state.anchor && !state.focus && !state.user) {
      this.delete(this.peer);
      return;
    }

    this.set(this.peer, {
      anchor: state.anchor?.encode() ?? null,
      focus: state.focus?.encode() ?? null,
      user: state.user ?? null,
    });
  }

  getLocal(): CursorPresenceState | undefined {
    const state = this.get(this.peer);
    if (!state) {
      return undefined;
    }

    return {
      anchor: state.anchor ? Cursor.decode(state.anchor) : undefined,
      focus: state.focus ? Cursor.decode(state.focus) : undefined,
      user: state.user ?? undefined,
    };
  }

  getAll(): { [peer in PeerID]: CursorPresenceState } {
    const ans: { [peer in PeerID]: CursorPresenceState } = {};
    for (const [peer, state] of Object.entries(this.getAllStates())) {
      if (!state) {
        continue;
      }

      ans[peer as PeerID] = {
        anchor: state.anchor ? Cursor.decode(state.anchor) : undefined,
        focus: state.focus ? Cursor.decode(state.focus) : undefined,
        user: state.user ?? undefined,
      };
    }
    return ans;
  }

  subscribeBy(listener: (by: "local" | "import" | "timeout") => void) {
    return super.subscribe((event) => listener(event.by));
  }
}

const loroEphemeralCursorPluginKey = new PluginKey<{
  presenceUpdated: boolean;
}>("loro-ephemeral-cursor");

export const LoroEphemeralCursorPlugin = (
  store: CursorEphemeralStore,
  options: CursorPluginOptions,
) =>
  createCursorPlugin(
    loroEphemeralCursorPluginKey,
    ephemeralStoreAdapter(store),
    options,
  );

const ephemeralStoreAdapter = (
  store: CursorEphemeralStore,
): CursorPresenceStore => ({
  getAll: () => store.getAll(),
  getLocal: () => store.getLocal(),
  setLocal: (state) => store.setLocal(state),
  subscribe: (listener) => store.subscribeBy(listener),
});
