
import type { Meta } from '@storybook/react';

import { Editor } from './Editor';
import { Loro } from 'loro-crdt';
import { useEffect, useRef } from 'react';
import { CursorAwareness } from 'loro-prosemirror';

const meta = {
  title: 'Editor/Basic',
  component: Editor,
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/configure/story-layout
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Editor>;

export default meta;

export const Basic = () => {
  const loroARef = useRef<Loro>(createLoro());
  const idA = loroARef.current.peerIdStr;
  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  return <div>
    <Editor loro={loroARef.current} awareness={awarenessA.current} />
  </div>

};

function createLoro() {
  const doc = new Loro();
  doc.configTextStyle({
    "em": { expand: "after" },
    "strong": { expand: "after" },
    "code": { expand: "none" },
    "link": { expand: "none" },
  })
  return doc
}

export const Sync = () => {
  const loroARef = useRef<Loro>(createLoro());
  const idA = loroARef.current.peerIdStr;
  const awarenessA = useRef<CursorAwareness>(new CursorAwareness(idA));
  const loroBRef = useRef<Loro>(createLoro());
  const idB = loroBRef.current.peerIdStr;
  const awarenessB = useRef<CursorAwareness>(new CursorAwareness(idB));
  useEffect(() => {
    loroARef.current.subscribe(event => {
      if (event.by === "local") {
        loroBRef.current.import(loroARef.current.exportFrom(loroBRef.current.oplogVersion()))
      }
    });
    loroBRef.current.subscribe(event => {
      if (event.by === "local") {
        loroARef.current.import(loroBRef.current.exportFrom(loroARef.current.oplogVersion()))
      }
    })
    awarenessA.current.addListener((_state, origin) => {
      if (origin === "local") {
        awarenessB.current.apply(awarenessA.current.encode([idA]));
      }
    })
    awarenessB.current.addListener((_state, origin) => {
      if (origin === "local") {
        awarenessA.current.apply(awarenessB.current.encode([idB]));
      }
    })

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div>
    <Editor loro={loroARef.current} awareness={awarenessA.current} />
    <Editor loro={loroBRef.current} awareness={awarenessB.current} />
  </div>
};
