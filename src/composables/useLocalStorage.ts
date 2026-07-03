import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { config } from '@/config';

export function getStoredUserName(): string | null {
  return localStorage.getItem('writeboard-username');
}

export function setStoredUserName(name: string): void {
  localStorage.setItem('writeboard-username', name);
}

export function useDocPersistence(ydoc: Y.Doc, roomId: string): IndexeddbPersistence {
  const persistence = new IndexeddbPersistence(`writeboard-doc-${roomId}`, ydoc);
  return persistence;
}

interface RecentRoom {
  id: string;
  name?: string;
  lastVisited: number;
}

export function trackRecentRoom(roomId: string, name?: string): void {
  const roomsKey = 'writeboard-rooms';
  const rooms: RecentRoom[] = JSON.parse(localStorage.getItem(roomsKey) || '[]');
  const existing = rooms.findIndex((r) => r.id === roomId);
  const existingName = existing >= 0 ? rooms[existing].name : undefined;
  if (existing >= 0) rooms.splice(existing, 1);
  rooms.unshift({ id: roomId, name: name || existingName, lastVisited: Date.now() });
  if (rooms.length > config.maxRecentRooms) rooms.length = config.maxRecentRooms;
  localStorage.setItem(roomsKey, JSON.stringify(rooms));
}
