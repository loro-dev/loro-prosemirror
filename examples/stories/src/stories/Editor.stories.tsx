import type { Meta } from "@storybook/react";

import { Editor } from "./Editor";
import { LoroDoc, VersionVector } from "loro-crdt";
import { useEffect, useRef, useState } from "react";
import { CursorAwareness, LoroDocType } from "loro-prosemirror";

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

export const BroadcastChannel = () => {
  // @ts-expect-error
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
