/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Meta, StoryFn } from "@storybook/react";

import { Editor } from "./Editor";
import { Cursor, LoroDoc, PeerID, VersionVector } from "loro-crdt";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  CursorEphemeralStore,
  LoroDocType,
} from "loro-prosemirror";
import { DagViewComponent } from "./DagView";
import type { ViewDagNode } from "./DagView";
import { convertSyncStepsToNodes } from "./editor-history";
import { styles } from "./styles/CollaborativeEditor.styles";

function applyCustomEphemeral(
  store: CursorEphemeralStore,
  peerId: PeerID,
  payload: {
    anchor: Uint8Array | null;
    focus: Uint8Array | null;
    user: {
      name: string;
      color: string;
    } | null;
  },
) {
  const temp = new CursorEphemeralStore(peerId);
  temp.setLocal({
    anchor: payload.anchor ? Cursor.decode(payload.anchor) : undefined,
    focus: payload.focus ? Cursor.decode(payload.focus) : undefined,
    user: payload.user ?? undefined,
  });
  const bytes = temp.encode(peerId);
  store.apply(bytes);
}

function sendCursorState(
  store: CursorEphemeralStore,
  peerId: PeerID,
  payload: {
    anchor: Cursor;
    focus: Cursor;
    user: { name: string; color: string };
  },
) {
  const temp = new CursorEphemeralStore(peerId);
  temp.setLocal(payload);
  const bytes = temp.encode(peerId);
  store.apply(bytes);
}

const meta = {
  title: "Editor/Basic",
  component: Editor,
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/configure/story-layout
    layout: "fullscreen",
  },
} satisfies Meta<typeof Editor>;

export default meta;

export const Basic = () => {
  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const idA = loroARef.current.peerIdStr;
  const presenceA = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idA));

  // Add debug cursor functionality
  const [debugPeerIdA, setDebugPeerIdA] = useState<PeerID | null>(null);

  const createDebugCursor = useCallback(() => {
    const currentState = presenceA.current.getLocal();
    if (!currentState?.anchor || !currentState?.focus) return;

    const debugId =
      debugPeerIdA || (Math.random().toString(10).substring(2, 15) as PeerID);
    if (!debugPeerIdA) setDebugPeerIdA(debugId);

    sendCursorState(presenceA.current, debugId, {
      user: { name: "Debug Cursor", color: "#ff00ff" },
      anchor: currentState.anchor,
      focus: currentState.focus,
    });
  }, [debugPeerIdA]);

  return (
    <div>
      <div style={{ marginBottom: "10px" }}>
        <button
          onMouseDownCapture={createDebugCursor}
          style={{
            padding: "5px 10px",
            backgroundColor: "#ff00ff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Add Debug Cursor
        </button>
      </div>
      <Editor loro={loroARef.current} presence={presenceA.current} />
    </div>
  );
};

export const BasicWithHistory = () => {
  const [dagInfo, setDagInfo] = useState<{
    nodes: ViewDagNode[];
    frontiers: string[];
  }>({ nodes: [], frontiers: [] });

  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const idA = loroARef.current.peerIdStr;
  const presenceA = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idA));

  const DagView: StoryFn<{ nodes: ViewDagNode[]; frontiers: string[] }> = (
    args,
  ) => (
    <div style={styles.historyCard}>
      <h3 style={styles.historyTitle}>Operation History</h3>
      <DagViewComponent {...args} />
    </div>
  );

  useEffect(() => {
    loroARef.current.setRecordTimestamp(true);

    const subscription = loroARef.current.subscribe((event) => {
      if (event.by === "local") {
        loroARef.current.commit();
        const updatedDagInfo = convertSyncStepsToNodes(loroARef.current);
        setDagInfo(updatedDagInfo);
      }
    });

    return () => subscription();
  }, [idA]);

  return (
    <div style={styles.container}>
      <div style={styles.editorsContainer}>
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor</h3>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroARef.current}
              presence={presenceA.current}
              containerId={loroARef.current.getMap("doc").id}
            />
          </div>
        </div>
      </div>

      <DagView nodes={dagInfo.nodes} frontiers={dagInfo.frontiers} />
    </div>
  );
};

type UpdateType = "ephemeral" | "crdt";
type UpdateMessage = {
  type: "update";
  updateType: UpdateType;
  payload: Uint8Array;
};

function parseMessage(data: Uint8Array): UpdateMessage {
  const messageType = data[0];
  switch (messageType) {
    case 1: {
      // Update
      const updateType = (() => {
        switch (data[1]) {
          case 0:
            return "ephemeral";
          case 1:
            return "crdt";
          default:
            throw new Error(`Unknown update type: ${data[1]}`);
        }
      })();
      return {
        type: "update",
        updateType,
        payload: data.slice(2),
      };
    }
    default:
      throw new Error(`Unknown message type: ${messageType}`);
  }
}

function encodeUpdateMessage(
  updateType: UpdateType,
  payload: Uint8Array,
): Uint8Array {
  const message = new Uint8Array(2 + payload.length);
  message[0] = 1;
  message[1] = updateType === "ephemeral" ? 0 : 1;
  message.set(payload, 2);
  return message;
}

export const Sync = () => {
  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const idA = loroARef.current.peerIdStr;
  const presenceA = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idA));
  const loroBRef = useRef<LoroDocType>(new LoroDoc());
  const idB = loroBRef.current.peerIdStr;
  const presenceB = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idB));

  // Add debug cursor functionality
  const [debugPeerIdA, setDebugPeerIdA] = useState<PeerID | null>(null);
  const [debugPeerIdB, setDebugPeerIdB] = useState<PeerID | null>(null);

  const createDebugCursorA = useCallback(() => {
    const currentState = presenceA.current.getLocal();
    if (!currentState?.anchor || !currentState?.focus) return;

    const debugId =
      debugPeerIdA || (Math.random().toString(10).substring(2, 15) as PeerID);
    if (!debugPeerIdA) setDebugPeerIdA(debugId as PeerID);

    sendCursorState(presenceA.current, debugId, {
      user: { name: "Debug A", color: "#ff00ff" },
      anchor: currentState.anchor,
      focus: currentState.focus,
    });
  }, [debugPeerIdA]);

  const createDebugCursorB = useCallback(() => {
    const currentState = presenceB.current.getLocal();
    if (!currentState?.anchor || !currentState?.focus) return;

    const debugId =
      debugPeerIdB || (Math.random().toString(10).substring(2, 15) as PeerID);
    if (!debugPeerIdB) setDebugPeerIdB(debugId as PeerID);

    sendCursorState(presenceB.current, debugId, {
      user: { name: "Debug B", color: "#00ffff" },
      anchor: currentState.anchor,
      focus: currentState.focus,
    });
  }, [debugPeerIdB]);

  useEffect(() => {
    loroARef.current.subscribe((event) => {
      if (event.by === "local") {
        loroBRef.current.import(
          loroARef.current.export({
            mode: "update",
            from: loroBRef.current.oplogVersion(),
          }),
        );
      }
    });
    loroBRef.current.subscribe((event) => {
      if (event.by === "local") {
        loroARef.current.import(
          loroBRef.current.export({
            mode: "update",
            from: loroARef.current.oplogVersion(),
          }),
        );
      }
    });
    const unsubscribeEphemeralA = presenceA.current.subscribeLocalUpdates(
      (bytes) => {
        presenceB.current.apply(bytes);
      },
    );
    const unsubscribeEphemeralB = presenceB.current.subscribeLocalUpdates(
      (bytes) => {
        presenceA.current.apply(bytes);
      },
    );

    return () => {
      unsubscribeEphemeralA();
      unsubscribeEphemeralB();
    };
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: "20px", marginBottom: "10px" }}>
        <button
          onMouseDownCapture={createDebugCursorA}
          style={{
            padding: "5px 10px",
            backgroundColor: "#ff00ff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Debug Cursor A
        </button>
        <button
          onMouseDownCapture={createDebugCursorB}
          style={{
            padding: "5px 10px",
            backgroundColor: "#ff00ff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Debug Cursor B
        </button>
      </div>
      <Editor
        loro={loroARef.current}
        presence={presenceA.current}
        containerId={loroARef.current?.getMap("doc")?.id}
      />
      <Editor
        loro={loroBRef.current}
        presence={presenceB.current}
        containerId={loroARef.current?.getMap("doc")?.id}
      />
    </div>
  );
};

export const SyncWithHistory = () => {
  const [dagInfo, setDagInfo] = useState<{
    nodes: ViewDagNode[];
    frontiers: string[];
  }>({ nodes: [], frontiers: [] });

  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const idA = loroARef.current.peerIdStr;
  const presenceA = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idA));
  const loroBRef = useRef<LoroDocType>(new LoroDoc());
  const idB = loroBRef.current.peerIdStr;
  const presenceB = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idB));

  const DagView: StoryFn<{ nodes: ViewDagNode[]; frontiers: string[] }> = (
    args,
  ) => (
    <div style={styles.historyCard}>
      <h3 style={styles.historyTitle}>Operation History</h3>
      <DagViewComponent {...args} />
    </div>
  );

  useEffect(() => {
    loroARef.current.setRecordTimestamp(true);
    loroBRef.current.setRecordTimestamp(true);

    const subscriptionA = loroARef.current.subscribe((event) => {
      if (event.by === "local") {
        loroARef.current.commit();

        const updateBytes = loroARef.current.export({
          mode: "update",
          from: loroBRef.current.oplogVersion(),
        });
        loroBRef.current.import(updateBytes);

        const updatedDagInfo = convertSyncStepsToNodes(loroARef.current);
        setDagInfo(updatedDagInfo);
      }
    });

    const subscriptionB = loroBRef.current.subscribe((event) => {
      if (event.by === "local") {
        loroBRef.current.commit();

        const updateBytes = loroBRef.current.export({
          mode: "update",
          from: loroARef.current.oplogVersion(),
        });
        loroARef.current.import(updateBytes);

        const updatedDagInfo = convertSyncStepsToNodes(loroBRef.current);
        setDagInfo(updatedDagInfo);
      }
    });

    const unsubscribeEphemeralA = presenceA.current.subscribeLocalUpdates(
      (bytes) => {
        presenceB.current.apply(bytes);
      },
    );
    const unsubscribeEphemeralB = presenceB.current.subscribeLocalUpdates(
      (bytes) => {
        presenceA.current.apply(bytes);
      },
    );

    return () => {
      subscriptionA();
      subscriptionB();
      unsubscribeEphemeralA();
      unsubscribeEphemeralB();
    };
  }, [idA, idB]);

  return (
    <div style={styles.container}>
      <div style={styles.editorsContainer}>
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor A</h3>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroARef.current}
              presence={presenceA.current}
              containerId={loroARef.current.getMap("doc").id}
            />
          </div>
        </div>

        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor B</h3>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroBRef.current}
              presence={presenceB.current}
              containerId={loroBRef.current.getMap("doc").id}
            />
          </div>
        </div>
      </div>

      <DagView nodes={dagInfo.nodes} frontiers={dagInfo.frontiers} />
    </div>
  );
};

export const BroadcastChannelExample = () => {
  const bcA = useRef<BroadcastChannel>(new BroadcastChannel(`A`));
  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const idA = loroARef.current.peerIdStr;
  const presenceA = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idA));
  const [lastStateA, setLastStateA] = useState<VersionVector | undefined>();
  useEffect(() => {
    bcA.current.onmessage = (event) => {
      const parsedMessage = parseMessage(event.data);
      if (parsedMessage.type === "update") {
        // Handle different update types
        switch (parsedMessage.updateType) {
          case "ephemeral":
            presenceA.current.apply(parsedMessage.payload);
            break;
          case "crdt":
            loroARef.current.import(parsedMessage.payload);
            loroARef.current.commit({ origin: "sys:bc-update" });
            break;
        }
      }
    };
    loroARef.current.subscribe((event) => {
      if (event.by === "local") {
        bcA.current.postMessage(
          encodeUpdateMessage(
            "crdt",
            loroARef.current.export({
              mode: "update",
              from: lastStateA,
            }),
          ),
        );
        setLastStateA(loroARef.current.version());
      }
    });
    const unsubscribePresence = presenceA.current.subscribeLocalUpdates(
      (bytes) => {
        bcA.current.postMessage(encodeUpdateMessage("ephemeral", bytes));
      },
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      unsubscribePresence();
    };
  }, []);

  return (
    <div>
      <Editor loro={loroARef.current} presence={presenceA.current} />
    </div>
  );
};

export const OfflineSyncWithHistory = () => {
  const [dagInfo, setDagInfo] = useState<{
    nodes: ViewDagNode[];
    frontiers: string[];
  }>({ nodes: [], frontiers: [] });

  const [isAOnline, setIsAOnline] = useState(true);
  const [isBOnline, setIsBOnline] = useState(true);

  // Create a separate "debug" peer ID for visualization
  const [debugPeerIdA, setDebugPeerIdA] = useState<PeerID | null>(null);
  const [debugPeerIdB, setDebugPeerIdB] = useState<PeerID | null>(null);

  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const loroBRef = useRef<LoroDocType>(new LoroDoc());

  const idA = useMemo(() => loroARef.current.peerIdStr, []);
  const idB = useMemo(() => loroBRef.current.peerIdStr, []);

  const presenceA = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idA));
  const presenceB = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idB));

  const DagView: StoryFn<{ nodes: ViewDagNode[]; frontiers: string[] }> = (
    args,
  ) => (
    <div style={styles.historyCard}>
      <h3 style={styles.historyTitle}>Operation History</h3>
      <DagViewComponent {...args} />
    </div>
  );

  // Function to create debug cursor for Editor A
  const createDebugCursorA = useCallback(() => {
    // Get current cursor information
    const currentState = presenceA.current.getLocal();
    if (!currentState?.anchor || !currentState?.focus) return;

    // Create a unique debug peer ID if not exists
    const debugId =
      debugPeerIdA || (Math.random().toString(10).substring(2, 15) as PeerID);
    if (!debugPeerIdA) setDebugPeerIdA(debugId as PeerID);

    // Apply a debug cursor using current position but different user
    sendCursorState(presenceA.current, debugId, {
      user: { name: "Debug A", color: "#ff00ff" },
      anchor: currentState.anchor,
      focus: currentState.focus,
    });
  }, [debugPeerIdA]);

  // Function to create debug cursor for Editor B
  const createDebugCursorB = useCallback(() => {
    // Get current cursor information
    const currentState = presenceB.current.getLocal();
    if (!currentState?.anchor || !currentState?.focus) return;

    // Create a unique debug peer ID if not exists
    const debugId =
      debugPeerIdB || (Math.random().toString(10).substring(2, 15) as PeerID);
    if (!debugPeerIdB) setDebugPeerIdB(debugId as PeerID);

    // Apply a debug cursor using current position but different user
    sendCursorState(presenceB.current, debugId, {
      user: { name: "Debug B", color: "#00ffff" },
      anchor: currentState.anchor,
      focus: currentState.focus,
    });
  }, [debugPeerIdB]);

  // Add keyboard shortcut to toggle all peers online/offline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Ctrl+Alt+O (or Cmd+Alt+O on Mac) to toggle all peers
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === "KeyO") {
        console.log("toggle all peers online/offline");
        setIsAOnline((prev) => !prev);
        setIsBOnline((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    loroARef.current.setRecordTimestamp(true);
    loroBRef.current.setRecordTimestamp(true);
    if (!isAOnline || !isBOnline) {
      return;
    }

    // The changes of A are synchronized to B
    const subscriptionA = loroARef.current.subscribe((event) => {
      if (event.by === "local" && isAOnline && isBOnline) {
        loroARef.current.commit();

        loroBRef.current.import(
          loroARef.current.export({
            mode: "update",
            from: loroBRef.current.oplogVersion(),
          }),
        );

        const updatedDagInfo = convertSyncStepsToNodes(loroARef.current);
        setDagInfo(updatedDagInfo);
      }
    });

    // The changes of B are synchronized to A
    const subscriptionB = loroBRef.current.subscribe((event) => {
      if (event.by === "local" && isBOnline && isAOnline) {
        loroBRef.current.commit();

        loroARef.current.import(
          loroBRef.current.export({
            mode: "update",
            from: loroARef.current.oplogVersion(),
          }),
        );

        const updatedDagInfo = convertSyncStepsToNodes(loroBRef.current);
        setDagInfo(updatedDagInfo);
      }
    });

    // Cursor synchronization
    const unsubscribeEphemeralA = presenceA.current.subscribeLocalUpdates(
      (bytes) => {
        if (isAOnline && isBOnline) {
          presenceB.current.apply(bytes);
        }
      },
    );
    const unsubscribeEphemeralB = presenceB.current.subscribeLocalUpdates(
      (bytes) => {
        if (isAOnline && isBOnline) {
          presenceA.current.apply(bytes);
        }
      },
    );

    return () => {
      subscriptionA();
      subscriptionB();
      unsubscribeEphemeralA();
      unsubscribeEphemeralB();
    };
  }, [isAOnline, isBOnline, idA, idB]);

  // The synchronization logic goes online again
  const syncWhenOnline = useCallback(() => {
    if (isAOnline && isBOnline) {
      // Synchronize A to B first
      const snapshotA = loroARef.current.export({ mode: "snapshot" });
      loroBRef.current.import(snapshotA);
      loroBRef.current.commit();

      // Then synchronize B to A
      const snapshotB = loroBRef.current.export({ mode: "snapshot" });
      loroARef.current.import(snapshotB);
      loroARef.current.commit();

      const updatedDagInfo = convertSyncStepsToNodes(
        loroARef.current as LoroDoc,
      );
      setDagInfo(updatedDagInfo);
    }
  }, [isAOnline, isBOnline]);

  useEffect(() => {
    syncWhenOnline();
  }, [isAOnline, isBOnline, syncWhenOnline]);

  return (
    <div style={styles.container}>
      <div style={styles.editorsContainer}>
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor A</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onMouseDownCapture={createDebugCursorA}
                style={{
                  ...styles.statusButton(true),
                  backgroundColor: "#ff00ff",
                }}
                title="Add debug cursor at current position"
              >
                Debug Cursor
              </button>
              <button
                onClick={() => setIsAOnline(!isAOnline)}
                style={styles.statusButton(isAOnline)}
                title="Toggle online/offline, Meta+Alt+O"
              >
                {isAOnline ? "Online" : "Offline"}
              </button>
            </div>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroARef.current}
              presence={presenceA.current}
              containerId={loroARef.current.getMap("doc").id}
            />
          </div>
        </div>

        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor B</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onMouseDownCapture={createDebugCursorB}
                style={{
                  ...styles.statusButton(true),
                  backgroundColor: "#ff00ff",
                }}
                title="Add debug cursor at current position"
              >
                Debug Cursor
              </button>
              <button
                onClick={() => setIsBOnline(!isBOnline)}
                style={styles.statusButton(isBOnline)}
                title="Toggle online/offline, Meta+Alt+O"
              >
                {isBOnline ? "Online" : "Offline"}
              </button>
            </div>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroBRef.current}
              presence={presenceB.current}
              containerId={loroBRef.current.getMap("doc").id}
            />
          </div>
        </div>
      </div>

      <DagView nodes={dagInfo.nodes} frontiers={dagInfo.frontiers} />
    </div>
  );
};

export const MultiOfflineSyncWithHistory = () => {
  const [dagInfo, setDagInfo] = useState<{
    nodes: ViewDagNode[];
    frontiers: string[];
  }>({ nodes: [], frontiers: [] });

  const [isAOnline, setIsAOnline] = useState(true);
  const [isBOnline, setIsBOnline] = useState(true);
  const [isCOnline, setIsCOnline] = useState(true);
  const [isDOnline, setIsDOnline] = useState(true);
  const [isEOnline, setIsEOnline] = useState(true);

  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const loroBRef = useRef<LoroDocType>(new LoroDoc());
  const loroCRef = useRef<LoroDocType>(new LoroDoc());
  const loroDRef = useRef<LoroDocType>(new LoroDoc());
  const loroERef = useRef<LoroDocType>(new LoroDoc());

  const idA = useMemo(() => loroARef.current.peerIdStr, []);
  const idB = useMemo(() => loroBRef.current.peerIdStr, []);
  const idC = useMemo(() => loroCRef.current.peerIdStr, []);
  const idD = useMemo(() => loroDRef.current.peerIdStr, []);
  const idE = useMemo(() => loroERef.current.peerIdStr, []);

  const presenceA = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idA));
  const presenceB = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idB));
  const presenceC = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idC));
  const presenceD = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idD));
  const presenceE = useRef<CursorEphemeralStore>(new CursorEphemeralStore(idE));

  // Add keyboard shortcut to toggle all peers online/offline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Ctrl+Alt+O (or Cmd+Alt+O on Mac) to toggle all peers
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === "KeyO") {
        const newState = !(
          isAOnline &&
          isBOnline &&
          isCOnline &&
          isDOnline &&
          isEOnline
        );
        setIsAOnline(newState);
        setIsBOnline(newState);
        setIsCOnline(newState);
        setIsDOnline(newState);
        setIsEOnline(newState);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isAOnline, isBOnline, isCOnline, isDOnline, isEOnline]);

  const DagTemplate: StoryFn<{
    nodes: ViewDagNode[];
    frontiers: string[];
  }> = (args) => (
    <div style={styles.historyCard}>
      <h3 style={styles.historyTitle}>Operation History</h3>
      <DagViewComponent {...args} />
    </div>
  );

  const DagView = DagTemplate.bind({});
  DagView.args = {
    nodes: dagInfo.nodes,
    frontiers: dagInfo.frontiers,
  };

  useEffect(() => {
    loroARef.current.setRecordTimestamp(true);
    loroBRef.current.setRecordTimestamp(true);
    loroCRef.current.setRecordTimestamp(true);
    loroDRef.current.setRecordTimestamp(true);
    loroERef.current.setRecordTimestamp(true);

    const subscriptions = [
      // Editor A changes
      loroARef.current.subscribe((event) => {
        if (event.by === "local" && isAOnline) {
          loroARef.current.commit();
          const updateBytes = loroARef.current.export({
            mode: "update",
          });

          if (isBOnline) loroBRef.current.import(updateBytes);
          if (isCOnline) loroCRef.current.import(updateBytes);
          if (isDOnline) loroDRef.current.import(updateBytes);
          if (isEOnline) loroERef.current.import(updateBytes);

          const updatedDagInfo = convertSyncStepsToNodes(loroARef.current);
          setDagInfo(updatedDagInfo);
        }
      }),
      // Editor B changes
      loroBRef.current.subscribe((event) => {
        if (event.by === "local" && isBOnline) {
          loroBRef.current.commit();
          const updateBytes = loroBRef.current.export({
            mode: "update",
          });

          if (isAOnline) loroARef.current.import(updateBytes);
          if (isCOnline) loroCRef.current.import(updateBytes);
          if (isDOnline) loroDRef.current.import(updateBytes);
          if (isEOnline) loroERef.current.import(updateBytes);

          const updatedDagInfo = convertSyncStepsToNodes(loroBRef.current);
          setDagInfo(updatedDagInfo);
        }
      }),
      // Editor C changes
      loroCRef.current.subscribe((event) => {
        if (event.by === "local" && isCOnline) {
          loroCRef.current.commit();
          const updateBytes = loroCRef.current.export({
            mode: "update",
          });

          if (isAOnline) loroARef.current.import(updateBytes);
          if (isBOnline) loroBRef.current.import(updateBytes);
          if (isDOnline) loroDRef.current.import(updateBytes);
          if (isEOnline) loroERef.current.import(updateBytes);

          const updatedDagInfo = convertSyncStepsToNodes(loroCRef.current);
          setDagInfo(updatedDagInfo);
        }
      }),
      // Editor D changes
      loroDRef.current.subscribe((event) => {
        if (event.by === "local" && isDOnline) {
          loroDRef.current.commit();
          const updateBytes = loroDRef.current.export({
            mode: "update",
          });

          if (isAOnline) loroARef.current.import(updateBytes);
          if (isBOnline) loroBRef.current.import(updateBytes);
          if (isCOnline) loroCRef.current.import(updateBytes);
          if (isEOnline) loroERef.current.import(updateBytes);

          const updatedDagInfo = convertSyncStepsToNodes(loroDRef.current);
          setDagInfo(updatedDagInfo);
        }
      }),
      // Editor E changes
      loroERef.current.subscribe((event) => {
        if (event.by === "local" && isEOnline) {
          loroERef.current.commit();
          const updateBytes = loroERef.current.export({
            mode: "update",
          });

          if (isAOnline) loroARef.current.import(updateBytes);
          if (isBOnline) loroBRef.current.import(updateBytes);
          if (isCOnline) loroCRef.current.import(updateBytes);
          if (isDOnline) loroDRef.current.import(updateBytes);

          const updatedDagInfo = convertSyncStepsToNodes(loroERef.current);
          setDagInfo(updatedDagInfo);
        }
      }),
    ];

    // Cursor presence
    const stores = [
      { store: presenceA.current, online: isAOnline },
      { store: presenceB.current, online: isBOnline },
      { store: presenceC.current, online: isCOnline },
      { store: presenceD.current, online: isDOnline },
      { store: presenceE.current, online: isEOnline },
    ];
    const unsubscribers = stores.map(({ store, online }) =>
      store.subscribeLocalUpdates((bytes) => {
        if (!online) return;
        if (isAOnline && store !== presenceA.current) presenceA.current.apply(bytes);
        if (isBOnline && store !== presenceB.current) presenceB.current.apply(bytes);
        if (isCOnline && store !== presenceC.current) presenceC.current.apply(bytes);
        if (isDOnline && store !== presenceD.current) presenceD.current.apply(bytes);
        if (isEOnline && store !== presenceE.current) presenceE.current.apply(bytes);
      }),
    );

    return () => {
      subscriptions.forEach((unsub) => unsub());
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    isAOnline,
    isBOnline,
    isCOnline,
    isDOnline,
    isEOnline,
    idA,
    idB,
    idC,
    idD,
    idE,
  ]);

  const syncWhenOnline = useCallback(
    (editorRef: React.RefObject<LoroDocType>, isOnline: boolean) => {
      if (!isOnline) return;

      const otherOnlineEditors = [
        { ref: loroARef, isOnline: isAOnline },
        { ref: loroBRef, isOnline: isBOnline },
        { ref: loroCRef, isOnline: isCOnline },
        { ref: loroDRef, isOnline: isDOnline },
        { ref: loroERef, isOnline: isEOnline },
      ].filter(
        (editor) => editor.isOnline && editor.ref.current !== editorRef.current,
      );

      otherOnlineEditors.forEach(({ ref: otherRef }) => {
        // Sync other editors to the current editor first
        const otherSnapshot = otherRef.current.export({
          mode: "update",
        });
        editorRef.current?.import(otherSnapshot);
        editorRef.current?.commit();

        // Then synchronize the current editor to another editor
        const currentSnapshot = editorRef.current?.export({
          mode: "update",
        });
        if (currentSnapshot) {
          otherRef.current.import(currentSnapshot);
          otherRef.current.commit();
        }
      });

      if (editorRef.current) {
        const updatedDagInfo = convertSyncStepsToNodes(editorRef.current);
        setDagInfo(updatedDagInfo);
      }
    },
    [isAOnline, isBOnline, isCOnline, isDOnline, isEOnline],
  );

  // Call synchronization when state changes
  useEffect(() => {
    if (isAOnline) syncWhenOnline(loroARef, isAOnline);
  }, [isAOnline, syncWhenOnline]);

  useEffect(() => {
    if (isBOnline) syncWhenOnline(loroBRef, isBOnline);
  }, [isBOnline, syncWhenOnline]);

  useEffect(() => {
    if (isCOnline) syncWhenOnline(loroCRef, isCOnline);
  }, [isCOnline, syncWhenOnline]);

  useEffect(() => {
    if (isDOnline) syncWhenOnline(loroDRef, isDOnline);
  }, [isDOnline, syncWhenOnline]);

  useEffect(() => {
    if (isEOnline) syncWhenOnline(loroERef, isEOnline);
  }, [isEOnline, syncWhenOnline]);

  return (
    <div style={styles.container}>
      <div style={styles.editorsContainer}>
        {/* Editor A */}
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor A</h3>
            <button
              onClick={() => setIsAOnline(!isAOnline)}
              style={styles.statusButton(isAOnline)}
            >
              {isAOnline ? "Online" : "Offline"}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroARef.current}
              presence={presenceA.current}
              containerId={loroARef.current.getMap("doc").id}
            />
          </div>
        </div>

        {/* Editor B */}
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor B</h3>
            <button
              onClick={() => setIsBOnline(!isBOnline)}
              style={styles.statusButton(isBOnline)}
            >
              {isBOnline ? "Online" : "Offline"}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroBRef.current}
              presence={presenceB.current}
              containerId={loroBRef.current.getMap("doc").id}
            />
          </div>
        </div>

        {/* Editor C */}
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor C</h3>
            <button
              onClick={() => setIsCOnline(!isCOnline)}
              style={styles.statusButton(isCOnline)}
            >
              {isCOnline ? "Online" : "Offline"}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroCRef.current}
              presence={presenceC.current}
              containerId={loroCRef.current.getMap("doc").id}
            />
          </div>
        </div>

        {/* Editor D */}
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor D</h3>
            <button
              onClick={() => setIsDOnline(!isDOnline)}
              style={styles.statusButton(isDOnline)}
            >
              {isDOnline ? "Online" : "Offline"}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroDRef.current}
              presence={presenceD.current}
              containerId={loroDRef.current.getMap("doc").id}
            />
          </div>
        </div>

        {/* Editor E */}
        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor E</h3>
            <button
              onClick={() => setIsEOnline(!isEOnline)}
              style={styles.statusButton(isEOnline)}
            >
              {isEOnline ? "Online" : "Offline"}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroERef.current}
              presence={presenceE.current}
              containerId={loroERef.current.getMap("doc").id}
            />
          </div>
        </div>
      </div>
      <DagView nodes={dagInfo.nodes} frontiers={dagInfo.frontiers} />
    </div>
  );
};
