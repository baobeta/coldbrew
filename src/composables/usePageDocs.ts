import { onUnmounted } from 'vue';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { config } from '@/config';

export interface PageDocHandle {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  fragment: Y.XmlFragment;
}

interface Entry extends PageDocHandle {
  indexeddb: IndexeddbPersistence;
  lastUsed: number;
}

const MAX_LOADED = 4;

export function usePageDocs(roomId: string) {
  const cache = new Map<string, Entry>();
  let clock = 0; // monotonic counter (deterministic; avoids Date.now)

  function openPage(pageId: string): PageDocHandle {
    const existing = cache.get(pageId);
    if (existing) {
      existing.lastUsed = ++clock;
      return existing;
    }
    const ydoc = new Y.Doc();
    const room = `writeboard-${roomId}-p-${pageId}`;
    const provider = new WebsocketProvider(config.websocketServer, room, ydoc);
    const indexeddb = new IndexeddbPersistence(`writeboard-doc-${roomId}-p-${pageId}`, ydoc);
    const fragment = ydoc.getXmlFragment('content');
    const entry: Entry = { ydoc, provider, indexeddb, fragment, lastUsed: ++clock };
    cache.set(pageId, entry);
    evictIfNeeded();
    return entry;
  }

  function evictIfNeeded(): void {
    while (cache.size > MAX_LOADED) {
      let lruId: string | null = null;
      let lruUsed = Infinity;
      for (const [id, e] of cache) {
        if (e.lastUsed < lruUsed) {
          lruUsed = e.lastUsed;
          lruId = id;
        }
      }
      if (lruId === null) break;
      destroyEntry(lruId);
    }
  }

  function destroyEntry(pageId: string): void {
    const e = cache.get(pageId);
    if (!e) return;
    e.provider.destroy();
    e.indexeddb.destroy();
    e.ydoc.destroy();
    cache.delete(pageId);
  }

  onUnmounted(() => {
    for (const id of [...cache.keys()]) destroyEntry(id);
  });

  return { openPage, __cacheSize: () => cache.size };
}
