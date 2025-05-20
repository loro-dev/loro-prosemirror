/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Meta, StoryFn } from "@storybook/react";

import { Editor } from "./Editor";
import { LoroDoc, VersionVector } from "loro-crdt";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { CursorAwareness, LoroDocType } from "loro-prosemirror";
import { DagViewComponent } from './DagView';
import type { ViewDagNode } from "./DagView";
import { convertSyncStepsToNodes } from "./editor-history";
import { styles } from './styles/CollaborativeEditor.styles';

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
  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  return (
    <div>
      <Editor loro={loroARef.current} awareness={awarenessA.current} />
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
  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));

  const DagView: StoryFn<{ nodes: ViewDagNode[], frontiers: string[] }> = (args) => (
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
              awareness={awarenessA.current}
              containerId={loroARef.current.getMap("doc").id}
            />
          </div>
        </div>
      </div>

      <DagView nodes={dagInfo.nodes} frontiers={dagInfo.frontiers} />
    </div>
  );
};

type UpdateType = "ephemeral" | "awareness" | "crdt";
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
            return "awareness";
          case 2:
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
  message[1] = updateType === "ephemeral"
    ? 0
    : updateType === "awareness"
      ? 1
      : 2;
  message.set(payload, 2);
  return message;
}

export const Sync = () => {
  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const idA = loroARef.current.peerIdStr;
  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  const loroBRef = useRef<LoroDocType>(new LoroDoc());
  const idB = loroBRef.current.peerIdStr;
  const awarenessB = useRef<CursorAwareness>(new CursorAwareness(idB));
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
    awarenessA.current.addListener((_state, origin) => {
      if (origin === "local") {
        awarenessB.current.apply(awarenessA.current.encode([idA]));
      }
    });
    awarenessB.current.addListener((_state, origin) => {
      if (origin === "local") {
        awarenessA.current.apply(awarenessB.current.encode([idB]));
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Editor
        loro={loroARef.current}
        awareness={awarenessA.current}
        containerId={loroARef.current?.getMap("doc")?.id}
      />
      <Editor
        loro={loroBRef.current}
        awareness={awarenessB.current}
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
  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  const loroBRef = useRef<LoroDocType>(new LoroDoc());
  const idB = loroBRef.current.peerIdStr;
  const awarenessB = useRef<CursorAwareness>(new CursorAwareness(idB));

  const DagView: StoryFn<{ nodes: ViewDagNode[], frontiers: string[] }> = (args) => (
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

    awarenessA.current.addListener((_state, origin) => {
      if (origin === "local") {
        awarenessB.current.apply(awarenessA.current.encode([idA]));
      }
    });

    awarenessB.current.addListener((_state, origin) => {
      if (origin === "local") {
        awarenessA.current.apply(awarenessB.current.encode([idB]));
      }
    });

    return () => {
      subscriptionA();
      subscriptionB();
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
              awareness={awarenessA.current}
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
              awareness={awarenessB.current}
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
  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  const [lastStateA, setLastStateA] = useState<VersionVector | undefined>();
  useEffect(() => {
    bcA.current.onmessage = (event) => {
      const parsedMessage = parseMessage(event.data);
      if (parsedMessage.type === "update") {
        // Handle different update types
        switch (parsedMessage.updateType) {
          case "ephemeral":
            break;
          case "awareness":
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
            loroARef.current.export({ mode: "update", from: lastStateA }),
          ),
        );
        setLastStateA(loroARef.current.version());
      }
    });
    awarenessA.current.addListener((_state, origin) => {
      if (origin === "local") {
        bcA.current.postMessage(
          encodeUpdateMessage("awareness", awarenessA.current.encode([idA])),
        );
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Editor loro={loroARef.current} awareness={awarenessA.current} />
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

  const loroARef = useRef<LoroDocType>(new LoroDoc());
  const loroBRef = useRef<LoroDocType>(new LoroDoc());

  const idA = useMemo(() => loroARef.current.peerIdStr, []);
  const idB = useMemo(() => loroBRef.current.peerIdStr, []);

  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  const awarenessB = useRef<CursorAwareness>(new CursorAwareness(idB));

  const DagView: StoryFn<{ nodes: ViewDagNode[], frontiers: string[] }> = (args) => (
    <div style={styles.historyCard}>
      <h3 style={styles.historyTitle}>Operation History</h3>
      <DagViewComponent {...args} />
    </div>
  );

  // Add keyboard shortcut to toggle all peers online/offline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Ctrl+Alt+O (or Cmd+Alt+O on Mac) to toggle all peers
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyO') {
        console.log("toggle all peers online/offline");
        setIsAOnline(prev => !prev);
        setIsBOnline(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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

        loroBRef.current.import(loroARef.current.export({
          mode: "update",
          from: loroBRef.current.oplogVersion(),
        }));

        const updatedDagInfo = convertSyncStepsToNodes(loroARef.current);
        setDagInfo(updatedDagInfo);
      }
    });

    // The changes of B are synchronized to A
    const subscriptionB = loroBRef.current.subscribe((event) => {
      if (event.by === "local" && isBOnline && isAOnline) {
        loroBRef.current.commit();

        loroARef.current.import(loroBRef.current.export({
          mode: "update",
          from: loroARef.current.oplogVersion(),
        }));

        const updatedDagInfo = convertSyncStepsToNodes(loroBRef.current);
        setDagInfo(updatedDagInfo);
      }
    });

    // Cursor synchronization
    const listenerA = (_state: any, origin: any) => {
      if (origin === "local" && isAOnline && isBOnline) {
        awarenessB.current.apply(awarenessA.current.encode([idA]));
      }
    };
    awarenessA.current.addListener(listenerA);

    const listenerB = (_state: any, origin: any) => {
      if (origin === "local" && isBOnline && isAOnline) {
        awarenessA.current.apply(awarenessB.current.encode([idB]));
      }
    };
    awarenessB.current.addListener(listenerB);
    const a = awarenessA.current;
    const b = awarenessA.current;

    return () => {
      subscriptionA();
      subscriptionB();
      a.removeListener(listenerA);
      b.removeListener(listenerB);
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

      const updatedDagInfo = convertSyncStepsToNodes(loroARef.current as LoroDoc);
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
            <button
              onClick={() => setIsAOnline(!isAOnline)}
              style={styles.statusButton(isAOnline)}
              title="Toggle online/offline, Meta+Alt+O"
            >
              {isAOnline ? 'Online' : 'Offline'}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroARef.current}
              awareness={awarenessA.current}
              containerId={loroARef.current.getMap("doc").id}
            />
          </div>
        </div>

        <div style={styles.editorCard}>
          <div style={styles.editorHeader}>
            <h3 style={styles.editorTitle}>Editor B</h3>
            <button
              onClick={() => setIsBOnline(!isBOnline)}
              style={styles.statusButton(isBOnline)}
              title="Toggle online/offline, Meta+Alt+O"
            >
              {isBOnline ? 'Online' : 'Offline'}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroBRef.current}
              awareness={awarenessB.current}
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

  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  const awarenessB = useRef<CursorAwareness>(new CursorAwareness(idB));
  const awarenessC = useRef<CursorAwareness>(new CursorAwareness(idC));
  const awarenessD = useRef<CursorAwareness>(new CursorAwareness(idD));
  const awarenessE = useRef<CursorAwareness>(new CursorAwareness(idE));

  // Add keyboard shortcut to toggle all peers online/offline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Ctrl+Alt+O (or Cmd+Alt+O on Mac) to toggle all peers
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyO') {
        const newState = !(isAOnline && isBOnline && isCOnline && isDOnline && isEOnline);
        setIsAOnline(newState);
        setIsBOnline(newState);
        setIsCOnline(newState);
        setIsDOnline(newState);
        setIsEOnline(newState);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isAOnline, isBOnline, isCOnline, isDOnline, isEOnline]);

  const DagTemplate: StoryFn<{ nodes: ViewDagNode[], frontiers: string[] }> = (args) => (
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
          const updateBytes = loroARef.current.export({ mode: "update" });

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
          const updateBytes = loroBRef.current.export({ mode: "update" });

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
          const updateBytes = loroCRef.current.export({ mode: "update" });

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
          const updateBytes = loroDRef.current.export({ mode: "update" });

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
          const updateBytes = loroERef.current.export({ mode: "update" });

          if (isAOnline) loroARef.current.import(updateBytes);
          if (isBOnline) loroBRef.current.import(updateBytes);
          if (isCOnline) loroCRef.current.import(updateBytes);
          if (isDOnline) loroDRef.current.import(updateBytes);

          const updatedDagInfo = convertSyncStepsToNodes(loroERef.current);
          setDagInfo(updatedDagInfo);
        }
      })
    ];

    // Cursor awareness
    const setupAwareness = (from: CursorAwareness, fromId: string, isFromOnline: boolean) => {
      const listener = (_state: any, origin: any) => {
        if (origin === "local" && isFromOnline) {
          const encoded = from.encode([`${parseInt(fromId)}`]);
          if (isAOnline) awarenessA.current.apply(encoded);
          if (isBOnline) awarenessB.current.apply(encoded);
          if (isCOnline) awarenessC.current.apply(encoded);
          if (isDOnline) awarenessD.current.apply(encoded);
          if (isEOnline) awarenessE.current.apply(encoded);
        }
      }
      from.addListener(listener);
      return () => from.removeListener(listener);
    };

    const unsubscribers = [
      setupAwareness(awarenessA.current, idA, isAOnline),
      setupAwareness(awarenessB.current, idB, isBOnline),
      setupAwareness(awarenessC.current, idC, isCOnline),
      setupAwareness(awarenessD.current, idD, isDOnline),
      setupAwareness(awarenessE.current, idE, isEOnline),
    ]

    return () => {
      subscriptions.forEach(unsub => unsub());
      unsubscribers.forEach(unsub => unsub())
    };
  }, [isAOnline, isBOnline, isCOnline, isDOnline, isEOnline, idA, idB, idC, idD, idE]);

  const syncWhenOnline = useCallback((editorRef: React.RefObject<LoroDocType>, isOnline: boolean) => {
    if (!isOnline) return;

    const otherOnlineEditors = [
      { ref: loroARef, isOnline: isAOnline },
      { ref: loroBRef, isOnline: isBOnline },
      { ref: loroCRef, isOnline: isCOnline },
      { ref: loroDRef, isOnline: isDOnline },
      { ref: loroERef, isOnline: isEOnline }
    ].filter(editor =>
      editor.isOnline && editor.ref.current !== editorRef.current
    );

    otherOnlineEditors.forEach(({ ref: otherRef }) => {
      // Sync other editors to the current editor first
      const otherSnapshot = otherRef.current.export({ mode: "update" });
      editorRef.current?.import(otherSnapshot);
      editorRef.current?.commit();

      // Then synchronize the current editor to another editor
      const currentSnapshot = editorRef.current?.export({ mode: "update" });
      if (currentSnapshot) {
        otherRef.current.import(currentSnapshot);
        otherRef.current.commit();
      }
    });

    if (editorRef.current) {
      const updatedDagInfo = convertSyncStepsToNodes(editorRef.current);
      setDagInfo(updatedDagInfo);
    }

  }, [isAOnline, isBOnline, isCOnline, isDOnline, isEOnline]);

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
              {isAOnline ? 'Online' : 'Offline'}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroARef.current}
              awareness={awarenessA.current}
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
              {isBOnline ? 'Online' : 'Offline'}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroBRef.current}
              awareness={awarenessB.current}
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
              {isCOnline ? 'Online' : 'Offline'}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroCRef.current}
              awareness={awarenessC.current}
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
              {isDOnline ? 'Online' : 'Offline'}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroDRef.current}
              awareness={awarenessD.current}
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
              {isEOnline ? 'Online' : 'Offline'}
            </button>
          </div>
          <div style={styles.editorContent}>
            <Editor
              loro={loroERef.current}
              awareness={awarenessE.current}
              containerId={loroERef.current.getMap("doc").id}
            />
          </div>
        </div>
      </div>
      <DagView nodes={dagInfo.nodes} frontiers={dagInfo.frontiers} />
    </div>
  );
};
