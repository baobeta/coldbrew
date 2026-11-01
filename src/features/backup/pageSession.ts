import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { config } from '@/app/config';
import { pageDbName, pageRoomName } from '@/features/documents/usePageDocs';
import type { StrokeRecord } from '@/features/canvas/types';

const SYNC_TIMEOUT_MS = 15000;
const LOCAL_LOAD_TIMEOUT_MS = 2000;
const CONFIRM_ATTEMPTS = 30;
const CONFIRM_RETRY_MS = 500;

export interface PageSession {
  fragment: Y.XmlFragment;
  strokes: Y.Array<StrokeRecord>;
  confirmSaved: () => Promise<void>;
  close: () => void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(room: string, ydoc: Y.Doc): WebsocketProvider {
  const provider = new WebsocketProvider(config.websocketServer, room, ydoc, { disableBc: true });
  // A background session isn't a person, so it stays out of the page's awareness.
  provider.awareness.setLocalState(null);
  return provider;
}

function waitForSync(provider: WebsocketProvider): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      provider.off('sync', onSync);
      reject(new Error('Timed out waiting for the server'));
    }, SYNC_TIMEOUT_MS);
    function onSync(synced: boolean) {
      if (!synced) return;
      clearTimeout(timer);
      provider.off('sync', onSync);
      resolve();
    }
    provider.on('sync', onSync);
  });
}

// y-websocket has no save acknowledgement, so this reads the page back over a new connection.
async function confirmOnServer(room: string, ydoc: Y.Doc): Promise<void> {
  const expected = Y.decodeStateVector(Y.encodeStateVector(ydoc));
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    const reader = new Y.Doc();
    const provider = connect(room, reader);
    try {
      await waitForSync(provider);
      const saved = Y.decodeStateVector(Y.encodeStateVector(reader));
      if ([...expected].every(([client, clock]) => (saved.get(client) ?? 0) >= clock)) return;
    } finally {
      provider.destroy();
      reader.destroy();
    }
    await delay(CONFIRM_RETRY_MS);
  }
  throw new Error('The server did not confirm the page');
}

// Bypasses usePageDocs, whose small cache would evict the page someone is working on.
// `useLocalData` also loads edits that were made offline and only exist on this device.
export async function openPageSession(
  roomId: string,
  pageId: string,
  { useLocalData }: { useLocalData: boolean },
): Promise<PageSession> {
  const room = pageRoomName(roomId, pageId);
  const ydoc = new Y.Doc();
  const provider = connect(room, ydoc);
  const indexeddb = useLocalData
    ? new IndexeddbPersistence(pageDbName(roomId, pageId), ydoc)
    : null;

  function close(): void {
    provider.destroy();
    void indexeddb?.destroy();
    ydoc.destroy();
  }

  try {
    await Promise.all([
      waitForSync(provider),
      // Storage can be blocked in private mode, and the server copy is still usable then.
      indexeddb && Promise.race([indexeddb.whenSynced, delay(LOCAL_LOAD_TIMEOUT_MS)]),
    ]);
  } catch (error) {
    close();
    throw error;
  }

  return {
    fragment: ydoc.getXmlFragment('content'),
    strokes: ydoc.getArray<StrokeRecord>('strokes'),
    confirmSaved: () => confirmOnServer(room, ydoc),
    close,
  };
}
