import * as Y from 'yjs';
import { config } from '@/config';
import { useDebounceFn } from '@vueuse/core';

//The 8192 is the chunk size for converting Uint8Array to a string via String.fromCharCode.apply().
function encodeUpdate(update: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < update.length; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, update.subarray(i, i + 8192) as unknown as number[]));
  }
  return btoa(chunks.join(''));
}

function decodeUpdate(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
}

export function getStoredUserName(): string | null {
  return localStorage.getItem('writeboard-username');
}

export function setStoredUserName(name: string): void {
  localStorage.setItem('writeboard-username', name);
}

export function useDocPersistence(ydoc: Y.Doc, roomId: string) {
  const docKey = `writeboard-doc-${roomId}`;
  const stored = localStorage.getItem(docKey);
  if (stored) {
    Y.applyUpdate(ydoc, decodeUpdate(stored));
  }

  const debounceUpdateFn = useDebounceFn(() => {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      const encoded = encodeUpdate(state);
      localStorage.setItem(docKey, encoded);
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }, config.docSaveDebounceMs);

  ydoc.on('update', () => debounceUpdateFn());
}

interface RecentRoom {
  id: string;
  lastVisited: number;
}

export function trackRecentRoom(roomId: string): void {
  const roomsKey = 'writeboard-rooms';
  const rooms: RecentRoom[] = JSON.parse(localStorage.getItem(roomsKey) || '[]');
  const existing = rooms.findIndex((r) => r.id === roomId);
  if (existing >= 0) rooms.splice(existing, 1);
  rooms.unshift({ id: roomId, lastVisited: Date.now() });
  if (rooms.length > config.maxRecentRooms) rooms.length = config.maxRecentRooms;
  localStorage.setItem(roomsKey, JSON.stringify(rooms));
}
