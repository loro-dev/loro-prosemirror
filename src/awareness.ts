import { Awareness, Cursor, PeerID } from "loro-crdt";

export class CursorAwareness extends Awareness<{
  anchor?: Uint8Array;
  focus?: Uint8Array;
}> {
  constructor(peer: PeerID, timeout: number = 30_000) {
    super(peer, timeout);
  }

  getAll(): { [peer in PeerID]: { anchor?: Cursor; focus?: Cursor } } {
    const ans: { [peer in PeerID]: { anchor?: Cursor; focus?: Cursor } } = {};
    for (const [peer, state] of Object.entries(this.getAllStates())) {
      ans[peer as PeerID] = {
        anchor: state.anchor && Cursor.decode(state.anchor),
        focus: state.focus && Cursor.decode(state.focus),
      };
    }
    return ans;
  }

  setLocal(state: { anchor?: Cursor; focus?: Cursor }) {
    this.setLocalState({
      anchor: state.anchor?.encode(),
      focus: state.focus?.encode(),
    });
  }

  getLocal() {
    const state = this.getLocalState();
    if (!state) {
      return undefined
    }

    return {
      anchor: state.anchor && Cursor.decode(state.anchor),
      focus: state.focus && Cursor.decode(state.focus),
    };
  }
}
